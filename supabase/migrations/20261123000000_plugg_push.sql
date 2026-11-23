-- KanDo Plugg: pushnotiser (Web Push) 15 min före ett pass och när
-- passets måltid är nådd. Edge function plugg-push skickar dem och anropas
-- varje minut av pg_cron. Se spec.md "Plugg".

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- En rad per enhet (webbläsare/hemskärms-app) som slagit på notiser.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on push_subscriptions to authenticated;

-- Samma enhet kan ha varit inloggad som någon annan (endpoint är unik per
-- enhet) — då tas den gamla raden över i stället för att RLS stoppar upserten.
create or replace function register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id <> auth.uid();
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

revoke all on function register_push_subscription(text, text, text, text) from public;
grant execute on function register_push_subscription(text, text, text, text) to authenticated;

-- Serverns egna fält på passen:
--   starts_at            = passets start som tidpunkt (date + start_time i
--                          svensk tid), räknas av triggern nedan
--   reminder_sent_at     = när påminnelsen 15 min före skickades
--   done_notified_target = vilken måltid (minuter) "tiden är ute" skickats för
--                          — ändras när man kör 10 min till, så nästa skickas
alter table plugg_sessions
  add column if not exists starts_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists done_notified_target integer;

create or replace function plugg_sessions_set_starts_at() returns trigger
language plpgsql as $$
begin
  new.starts_at := (new.date + new.start_time::time) at time zone 'Europe/Stockholm';
  return new;
end;
$$;

drop trigger if exists plugg_sessions_starts_at on plugg_sessions;
create trigger plugg_sessions_starts_at
  before insert or update of date, start_time on plugg_sessions
  for each row execute function plugg_sessions_set_starts_at();

update plugg_sessions
set starts_at = (date + start_time::time) at time zone 'Europe/Stockholm'
where starts_at is null;

create index if not exists plugg_sessions_due_reminder
  on plugg_sessions (starts_at)
  where status = 'planerad' and reminder_sent_at is null;

create index if not exists plugg_sessions_running
  on plugg_sessions (status)
  where status = 'pagar';

-- Varje minut. Hemligheten ligger i Vault (läggs in utanför git) och
-- kontrolleras av funktionen mot dess egen PLUGG_CRON_SECRET.
select cron.schedule(
  'plugg-push',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://gulotdyrurkbozmbhhny.supabase.co/functions/v1/plugg-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'plugg_push_cron_secret')
    ),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
);
