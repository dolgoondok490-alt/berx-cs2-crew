-- =========================================================
-- 008 ROLLBACK — ЗӨВХӨН import ХИЙГДЭЭГҮЙ үед (manifest-д 'imported' мөр байхгүй).
-- Import хийсний дараа ledger-ийн мөр устгахгүй: berx_historical_reverse (нөхөх засвар) ашиглана.
-- =========================================================
begin;
do $$ begin
  if exists (select 1 from information_schema.tables where table_name = 'berx_historical_import_manifest')
     and exists (select 1 from berx_historical_import_manifest where status in ('imported', 'reversed')) then
    raise exception '008 rollback refused: historical import already executed — use berx_historical_reverse instead';
  end if;
end $$;
drop function if exists berx_historical_cancel(jsonb);
drop function if exists berx_historical_reverse(jsonb);
drop function if exists berx_historical_import(jsonb);
drop function if exists berx_historical_approve(jsonb);
drop function if exists berx_historical_validate(text, jsonb);
drop function if exists berx_rank_name(int);
drop function if exists berx_match_fingerprint(text);
drop table if exists berx_historical_import_manifest;
alter table berx_ranked_matches drop constraint if exists berx_ranked_matches_origin_chk;
alter table berx_ranked_matches drop column if exists origin;
commit;
