-- Bevakning av SMSbang-telefonen: plugg-push kollar Jaktkolls sms-status
-- var 5:e minut och skickar en pushnotis till administratörerna
-- (funktionshemligheten SMS_ALERT_USER_IDS) när telefonen varit tyst > 1 h,
-- och en när den är igång igen. Raden här håller reda på vad som redan
-- larmats, så det blir ett larm per avbrott — inte ett i minuten.
create table if not exists sms_gateway_watch (
  id int primary key default 1 check (id = 1),
  state text not null default 'online' check (state in ('online', 'offline_alerted')),
  changed_at timestamptz not null default now(),
  last_checked_at timestamptz
);

insert into sms_gateway_watch (id) values (1) on conflict (id) do nothing;

-- Bara service role (edge functions) använder tabellen.
alter table sms_gateway_watch enable row level security;
