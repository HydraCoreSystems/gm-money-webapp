grant usage on schema gm_money to service_role;

grant select, insert, update, delete on table gm_money.app_users to service_role;

grant select, insert, update, delete on table gm_money.sync_events to service_role;
grant usage, select on sequence gm_money.sync_events_id_seq to service_role;