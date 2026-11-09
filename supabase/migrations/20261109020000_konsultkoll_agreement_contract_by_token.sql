-- KonsultKoll — konsulten kan skriva ut avtalen från förslagslänken.
--
-- När förslaget är godkänt (bekraftat/signerat) lämnar
-- konsultkoll_agreement_by_token även ut det som behövs för att bygga
-- avtalen: hela indatat (andelen står i avtalet, punkt 3.1) och de
-- uppgifter arbetsgivaren fyllt i. Före godkännandet är "contract" null och
-- andelen syns inte, som tidigare.

create or replace function konsultkoll_agreement_by_token(p_token text) returns json
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
    'confirmed_at', a.confirmed_at,
    'signed_at', a.signed_at,
    'contract', case when a.status in ('bekraftat', 'signerat')
      then json_build_object('inputs', a.inputs, 'details', a.details) end
  )
  from konsultkoll_agreements a join konsultkoll_employers e on e.id = a.employer_id
  where a.token = p_token and a.status <> 'avbrutet';
$$;
