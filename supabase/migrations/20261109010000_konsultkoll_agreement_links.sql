-- KonsultKoll — förslagslänk till konsulten.
--
-- Arbetsgivaren skickar en länk (/bekrafta/<token>) med mejl eller sms.
-- Konsulten öppnar den utan inloggning, ser förslaget och godkänner det.
-- Först därefter kan avtalen skrivas ut för underskrift på papper.
--
-- Säkerhet: token är 32 slumpade hex-tecken och gäller bara det här
-- förslaget. Funktionerna nedan är det enda som når raden via token, och
-- arbetsgivarens andel (inputs.employerSharePct) och lönekostnaden lämnas
-- aldrig ut.

alter table konsultkoll_agreements
  add column token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  add column sent_at timestamptz;

create function konsultkoll_agreement_by_token(p_token text) returns json
  language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'code', a.code,
    'employer', e.name,
    'consultant_name', coalesce(nullif(a.details ->> 'consultantName', ''), a.consultant_name),
    'inputs', a.inputs - 'employerSharePct',
    'results', json_build_object('deferredNet', a.results -> 'deferredNet', 'diffNet', a.results -> 'diffNet'),
    'rule_version', a.rule_version,
    'status', a.status,
    'created_at', a.created_at,
    'confirmed_at', a.confirmed_at
  )
  from konsultkoll_agreements a join konsultkoll_employers e on e.id = a.employer_id
  where a.token = p_token and a.status <> 'avbrutet';
$$;

create function konsultkoll_confirm_agreement_by_token(p_token text) returns timestamptz
  language plpgsql security definer set search_path = public
as $$
declare a konsultkoll_agreements; ts timestamptz := now();
begin
  if p_token is null or length(p_token) < 32 then raise exception 'Ogiltig länk'; end if;
  select * into a from konsultkoll_agreements where token = p_token;
  if not found or a.status = 'avbrutet' then raise exception 'Förslaget finns inte eller har dragits tillbaka'; end if;
  if a.status <> 'vantar' then return a.confirmed_at; end if;
  update konsultkoll_agreements set status = 'bekraftat', confirmed_at = ts, confirmed_by = auth.uid() where id = a.id;
  return ts;
end;
$$;

-- Arbetsgivaren markerar att länken skickats (visas som "Skickat …").
create function konsultkoll_mark_agreement_sent(p_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare a konsultkoll_agreements;
begin
  select * into a from konsultkoll_agreements where id = p_id;
  if not found or not konsultkoll_is_unlocked(a.employer_id) then raise exception 'Avtalet finns inte eller adminfliken är låst'; end if;
  update konsultkoll_agreements set sent_at = now() where id = p_id;
end;
$$;

revoke execute on function konsultkoll_agreement_by_token(text) from public;
revoke execute on function konsultkoll_confirm_agreement_by_token(text) from public;
revoke execute on function konsultkoll_mark_agreement_sent(uuid) from public, anon;
grant execute on function konsultkoll_agreement_by_token(text) to anon, authenticated;
grant execute on function konsultkoll_confirm_agreement_by_token(text) to anon, authenticated;
grant execute on function konsultkoll_mark_agreement_sent(uuid) to authenticated;
