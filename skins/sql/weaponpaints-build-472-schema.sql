-- WeaponPaints build-472 (commit 3b2eb5f9) — Utility.cs-ийн CREATE TABLE мөрүүд, ӨӨРЧЛӨЛТГҮЙ хуулбар.
-- Plugin эхний ачаалалт дээрээ эдгээрийг өөрөө үүсгэдэг. Энэ файлыг тест болон
-- plugin суулгахаас өмнө agent-ийн синкийг шалгахад ашиглана (IF NOT EXISTS — давхардахгүй).

CREATE TABLE IF NOT EXISTS `wp_player_skins` (
          `steamid` varchar(18) NOT NULL,
          `weapon_team` int(1) NOT NULL,
          `weapon_defindex` int(6) NOT NULL,
          `weapon_paint_id` int(6) NOT NULL,
          `weapon_wear` float NOT NULL DEFAULT 0.000001,
          `weapon_seed` int(16) NOT NULL DEFAULT 0,
          `weapon_nametag` VARCHAR(128) DEFAULT NULL,
          `weapon_stattrak` tinyint(1) NOT NULL DEFAULT 0,
          `weapon_stattrak_count` int(10) NOT NULL DEFAULT 0,
          `weapon_sticker_0` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
          `weapon_sticker_1` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
          `weapon_sticker_2` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
          `weapon_sticker_3` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
          `weapon_sticker_4` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0;0;0' COMMENT 'id;schema;x;y;wear;scale;rotation',
          `weapon_keychain` VARCHAR(128) NOT NULL DEFAULT '0;0;0;0;0' COMMENT 'id;x;y;z;seed',
          UNIQUE (`steamid`, `weapon_team`, `weapon_defindex`) -- Add unique constraint here
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `wp_player_knife` (
          `steamid` varchar(18) NOT NULL,
          `weapon_team` int(1) NOT NULL,
          `knife` varchar(64) NOT NULL,
          UNIQUE (`steamid`, `weapon_team`) -- Unique constraint
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `wp_player_gloves` (
          `steamid` varchar(18) NOT NULL,
          `weapon_team` int(1) NOT NULL,
          `weapon_defindex` int(11) NOT NULL,
          UNIQUE (`steamid`, `weapon_team`) -- Unique constraint
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `wp_player_agents` (
          `steamid` varchar(18) NOT NULL,
          `agent_ct` varchar(64) DEFAULT NULL,
          `agent_t` varchar(64) DEFAULT NULL,
          UNIQUE (`steamid`) -- Unique constraint
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `wp_player_music` (
          `steamid` varchar(64) NOT NULL,
          `weapon_team` int(1) NOT NULL,
          `music_id` int(11) NOT NULL,
          UNIQUE (`steamid`, `weapon_team`) -- Unique constraint
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `wp_player_pins` (
          `steamid` varchar(64) NOT NULL,
          `weapon_team` int(1) NOT NULL,
          `id` int(11) NOT NULL,
          UNIQUE (`steamid`, `weapon_team`) -- Unique constraint
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
