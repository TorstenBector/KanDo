-- KonsultKoll — från valt upplägg till anställningsavtal.
--
-- Arbetsgivaren väljer ett delat upplägg ("Gå vidare med AF_03"). En låst
-- kopia av upplägget sparas här, konsulten bekräftar den i appen, och
-- avtalen skrivs ut ur mallen i appen och undertecknas på papper.
--
-- Status: vantar (på konsultens bekräftelse) → bekraftat → signerat.
-- vantar/bekraftat kan avbrytas (avbrutet).
--
-- Säkerhet:
-- * Arbetsgivaren läser och skapar bara med upplåst adminflik
--   (konsultkoll_is_unlocked).
-- * Konsulten läser rader där consultant_email är den inloggades e-post.
--   Konsultläge-upplägg sparas under arbetsgivarens inloggning, så e-posten
--   anges av arbetsgivaren när upplägget väljs.
-- * Ingen update-policy. Uppgifter, status och bekräftelse ändras bara via
--   funktionerna nedan, så arbetsgivaren kan inte själv bekräfta åt
--   konsulten och upplägget (inputs/results) går inte att ändra.

create table konsultkoll_agreements (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references konsultkoll_employers(id) on delete cascade,
  share_id uuid references konsultkoll_deferred_shares(id) on delete set null,
  code text not null,
  consultant_email text not null check (position('@' in consultant_email) > 1),
  consultant_name text,
  inputs jsonb not null,
  results jsonb not null,
  rule_version integer not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'vantar' check (status in ('vantar', 'bekraftat', 'signerat', 'avbrutet')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  signed_at timestamptz,
  cancelled_at timestamptz
);
create index konsultkoll_agreements_employer_idx on konsultkoll_agreements(employer_id);
create index konsultkoll_agreements_email_idx on konsultkoll_agreements(lower(consultant_email));

alter table konsultkoll_agreements enable row level security;

create policy konsultkoll_agreements_select on konsultkoll_agreements
  for select to authenticated using (
    konsultkoll_is_unlocked(employer_id)
    or lower(consultant_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy konsultkoll_agreements_insert on konsultkoll_agreements
  for insert to authenticated with check (
    konsultkoll_is_unlocked(employer_id)
    and status = 'vantar' and confirmed_at is null and confirmed_by is null
    and signed_at is null and cancelled_at is null
  );

-- Arbetsgivaren fyller i avtalsuppgifterna (personnummer, kund …). E-posten
-- kan rättas så länge konsulten inte har bekräftat.
create function konsultkoll_save_agreement_details(p_id uuid, p_details jsonb, p_email text) returns void
  language plpgsql security definer set search_path = public
as $$
declare a konsultkoll_agreements;
begin
  select * into a from konsultkoll_agreements where id = p_id;
  if not found or not konsultkoll_is_unlocked(a.employer_id) then raise exception 'Avtalet finns inte eller adminfliken är låst'; end if;
  if a.status in ('signerat', 'avbrutet') then raise exception 'Avtalet är % och kan inte ändras', a.status; end if;
  if p_email is not null and lower(p_email) <> lower(a.consultant_email) then
    if a.status <> 'vantar' then raise exception 'E-posten kan inte ändras efter att konsulten bekräftat'; end if;
    if position('@' in p_email) < 2 then raise exception 'Ogiltig e-post'; end if;
  end if;
  update konsultkoll_agreements
    set details = coalesce(p_details, '{}'::jsonb), consultant_email = coalesce(p_email, consultant_email)
    where id = p_id;
end;
$$;

-- Konsulten bekräftar det valda upplägget. E-posten måste stämma med inloggningen.
create function konsultkoll_confirm_agreement(p_id uuid) returns timestamptz
  language plpgsql security definer set search_path = public
as $$
declare a konsultkoll_agreements; em text := lower(coalesce(auth.jwt() ->> 'email', '')); ts timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Inte inloggad'; end if;
  select * into a from konsultkoll_agreements where id = p_id;
  if not found or lower(a.consultant_email) <> em then raise exception 'Upplägget finns inte'; end if;
  if a.status <> 'vantar' then raise exception 'Upplägget är redan %', a.status; end if;
  update konsultkoll_agreements set status = 'bekraftat', confirmed_at = ts, confirmed_by = auth.uid() where id = p_id;
  return ts;
end;
$$;

-- Arbetsgivaren markerar avtalet som undertecknat, eller avbryter det.
create function konsultkoll_set_agreement_status(p_id uuid, p_status text) returns void
  language plpgsql security definer set search_path = public
as $$
declare a konsultkoll_agreements;
begin
  select * into a from konsultkoll_agreements where id = p_id;
  if not found or not konsultkoll_is_unlocked(a.employer_id) then raise exception 'Avtalet finns inte eller adminfliken är låst'; end if;
  if p_status = 'signerat' and a.status = 'bekraftat' then
    update konsultkoll_agreements set status = 'signerat', signed_at = now() where id = p_id;
  elsif p_status = 'bekraftat' and a.status = 'signerat' then
    update konsultkoll_agreements set status = 'bekraftat', signed_at = null where id = p_id; -- ångra
  elsif p_status = 'avbrutet' and a.status in ('vantar', 'bekraftat') then
    update konsultkoll_agreements set status = 'avbrutet', cancelled_at = now() where id = p_id;
  else
    raise exception 'Kan inte gå från % till %', a.status, p_status;
  end if;
end;
$$;

revoke execute on function konsultkoll_save_agreement_details(uuid, jsonb, text) from public, anon;
revoke execute on function konsultkoll_confirm_agreement(uuid) from public, anon;
revoke execute on function konsultkoll_set_agreement_status(uuid, text) from public, anon;
grant execute on function konsultkoll_save_agreement_details(uuid, jsonb, text) to authenticated;
grant execute on function konsultkoll_confirm_agreement(uuid) to authenticated;
grant execute on function konsultkoll_set_agreement_status(uuid, text) to authenticated;
