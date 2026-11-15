// =========================================================
// BERX Guard — Ranked AIM-ийн сервер талын хамгаалалт (CounterStrikeSharp 1.0.380, net10.0)
// ---------------------------------------------------------
//  Зорилго (хамгийн бага, зорилтот):
//   1. point_servercommand entity-г устгана — map-ын өөрийн "sv_cheats 1" г.м. серверийн команд ажиллахгүй.
//   2. sv_cheats 0-ээс өөр болвол тэр даруй (ConVar өөрчлөлтийн listener + tick бүрийн шалгалт) 0 болгоно.
//   3. Тоглогчийн cheat командыг (noclip, god, give, impulse, ent_fire, setpos ...) Pre hook-оор хаана —
//      sv_cheats түр зуур 1 болсон ч тоглогч эдгээрийг ашиглаж чадахгүй.
//  Анхдагчаар УНТРААЛТТАЙ (enforcing=0): Practice/infinite ammo (sv_cheats 1 ашигладаг) горимд нөлөөлөхгүй.
//  BERX Agent зөвхөн Ranked AIM эхлэхэд css_berx_guard_on, гарахад css_berx_guard_off илгээнэ.
//  Бүх командыг ЗӨВХӨН серверийн console/RCON ажиллуулна (тоглогч ажиллуулж чадахгүй).
//  ⚠ Хязгаарлалт: client-ийн өөрийн cheat convar (r_*, mat_*) нь sv_cheats replication-оос хамаарна. sv_cheats-ийг
//    бараг тэр даруй буцаадаг ч хэдэн frame-ийн цонх онолын хувьд үлдэж болно. Бодит сервер дээр баталгаажаагүй —
//    docs/RANKING.md-ийн "BERX Guard" хэсгийг үзнэ үү.
// =========================================================
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes;
using CounterStrikeSharp.API.Modules.Commands;
using CounterStrikeSharp.API.Modules.Cvars;
using Microsoft.Extensions.Logging;

namespace BerxGuard;

[MinimumApiVersion(380)]
public sealed class BerxGuardPlugin : BasePlugin
{
    public override string ModuleName => "BERX Guard";
    public override string ModuleVersion => "1.0.0";
    public override string ModuleAuthor => "BERX CS2 CREW";
    public override string ModuleDescription => "Ranked AIM: blocks map server commands, sv_cheats and client cheat commands while enforcing";

    // Тоглогчийн (client) cheat командууд — enforcing үед Pre hook-оор зогсооно
    private static readonly string[] BlockedClientCommands =
    {
        "noclip", "god", "buddha", "give", "impulse", "ent_fire", "ent_create", "ent_remove", "ent_remove_all",
        "ent_teleport", "ent_setpos", "setpos", "setpos_exact", "setpos_player", "setang", "setang_exact",
        "teleport", "bot_place", "sv_cheats", "firstperson", "thirdperson", "endround", "hurtme", "ent_setname"
    };

    private bool _enforcing;
    private long _killed, _reverts, _blocked;
    private ConVar? _cheats;
    private bool _reverting;

    public override void Load(bool hotReload)
    {
        _cheats = ConVar.Find("sv_cheats");
        RegisterListener<Listeners.OnEntitySpawned>(OnEntitySpawned);
        RegisterListener<Listeners.OnMapStart>(_ => { _cheats = ConVar.Find("sv_cheats"); if (_enforcing) Server.NextFrame(Sweep); });
        // Параметрийн төрлийг delegate-оос авна — sv_cheats-ийг өөрөө дахин уншина
        RegisterListener<Listeners.OnConVarChanged>(_ => CheckCheats());
        RegisterListener<Listeners.OnTick>(CheckCheats);
        foreach (var cmd in BlockedClientCommands) AddCommandListener(cmd, OnClientCommand, HookMode.Pre);

        AddCommand("css_berx_guard_status", "BERX Guard status (server console only)", (player, info) =>
        {
            if (player != null) return;
            info.ReplyToCommand(Status());
        });
        AddCommand("css_berx_guard_on", "Enable BERX Guard enforcement (server console only)", (player, info) =>
        {
            if (player != null) return;
            _enforcing = true;
            Sweep();
            CheckCheats();
            info.ReplyToCommand(Status());
        });
        AddCommand("css_berx_guard_off", "Disable BERX Guard enforcement (server console only)", (player, info) =>
        {
            if (player != null) return;
            _enforcing = false;
            info.ReplyToCommand(Status());
        });
    }

    private string Status()
    {
        var cheats = CheatsOn() ? 1 : 0;
        var health = _cheats != null ? "ok" : "degraded";
        return $"BERX_GUARD {health} v={ModuleVersion} enforcing={(_enforcing ? 1 : 0)} cheats={cheats} killed={_killed} reverts={_reverts} blocked={_blocked}";
    }

    private bool CheatsOn()
    {
        try { return _cheats != null && _cheats.GetPrimitiveValue<bool>(); }
        catch { return false; }
    }

    private void CheckCheats()
    {
        if (!_enforcing || _reverting || !CheatsOn()) return;
        _reverting = true;
        _reverts++;
        // Engine-ийн ердийн замаар (replication, callback хэвийн ажиллана)
        Server.ExecuteCommand("sv_cheats 0");
        Server.NextFrame(() => { _reverting = false; });
    }

    private void OnEntitySpawned(CEntityInstance entity)
    {
        if (!_enforcing || entity == null || !entity.IsValid) return;
        if (entity.DesignerName != "point_servercommand") return;
        KillEntity(entity);
    }

    private void Sweep()
    {
        if (!_enforcing) return;
        foreach (var e in Utilities.FindAllEntitiesByDesignerName<CPointServerCommand>("point_servercommand"))
            KillEntity(e);
    }

    private void KillEntity(CEntityInstance entity)
    {
        try
        {
            if (!entity.IsValid) return;
            entity.AcceptInput("Kill", null!, null!, "", 0);
            _killed++;
        }
        catch (Exception ex) { Logger.LogWarning("BERX Guard: could not remove point_servercommand: {Message}", ex.Message); }
    }

    private HookResult OnClientCommand(CCSPlayerController? player, CommandInfo info)
    {
        if (!_enforcing || player == null) return HookResult.Continue;   // серверийн console/RCON хэвийн
        _blocked++;
        return HookResult.Stop;
    }
}
