-- KonsultKoll — modulen "Uppskjuten lön" (steg 1: regeltabell + låsta
-- scenarier). Organisationer, roller och ledger kommer i steg 3.
--
-- konsultkoll_rule_params / konsultkoll_rule_notes: samma värden och texter
-- som src/lib/deferredSalary/rules.ts i KonsultKoll-repot. Läsbara för alla
-- inloggade; skrivs bara via dashboard/service role tills "Sök
-- regeländringar" (steg 5) finns. Ett godkänt förslag ger nya rader med
-- högre rule_version — gamla rader ändras aldrig, så sparade scenarier kan
-- alltid räknas om med exakt den version de skapades med.
--
-- konsultkoll_deferred_scenarios: ett sparat scenario är LÅST. Ingen
-- update-policy finns, så en ändring måste sparas som ett nytt ID
-- (AF_01, AF_02 …). Bara ägaren ser sina rader.

create table konsultkoll_rule_params (
  id bigserial primary key,
  rule_version integer not null,
  key text not null,
  value jsonb not null,
  valid_from date not null,
  valid_to date,
  source_url text,
  checked_at date,
  approved_by text,
  created_at timestamptz not null default now(),
  unique (rule_version, key, valid_from)
)
;
create table konsultkoll_rule_notes (
  id bigserial primary key,
  rule_version integer not null,
  key text not null,
  title text not null,
  body text not null,
  source_url text,
  checked_at date,
  created_at timestamptz not null default now(),
  unique (rule_version, key)
)
;
create table konsultkoll_deferred_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seq integer not null,
  code text not null,
  inputs jsonb not null,
  results jsonb not null,
  rule_version integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, seq)
)
;
create index konsultkoll_deferred_scenarios_user_idx on konsultkoll_deferred_scenarios(user_id)
;
alter table konsultkoll_rule_params enable row level security
;
alter table konsultkoll_rule_notes enable row level security
;
alter table konsultkoll_deferred_scenarios enable row level security
;
create policy konsultkoll_rule_params_read on konsultkoll_rule_params
  for select to authenticated using (true)
;
create policy konsultkoll_rule_notes_read on konsultkoll_rule_notes
  for select to authenticated using (true)
;
create policy konsultkoll_deferred_scenarios_select on konsultkoll_deferred_scenarios
  for select using (user_id = auth.uid())
;
create policy konsultkoll_deferred_scenarios_insert on konsultkoll_deferred_scenarios
  for insert with check (user_id = auth.uid())
;
create policy konsultkoll_deferred_scenarios_delete on konsultkoll_deferred_scenarios
  for delete using (user_id = auth.uid())
;
-- Regelversion 1: 2026 års värden. Bracket-tabellerna är i prisbasbelopp,
-- {upTo, a, b, from?} → värde = a·PBB + b·(x − from·PBB), se rules.ts.
insert into konsultkoll_rule_params (rule_version, key, value, valid_from, source_url, checked_at, approved_by) values
  (1, 'prisbasbelopp', '59200', '2026-01-01', 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html', '2026-11-07', 'Torsten'),
  (1, 'inkomstbasbelopp', '83400', '2026-01-01', 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html', '2026-11-07', 'Torsten'),
  (1, 'skiktgrans', '643000', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'statlig_skattesats', '0.2', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'brytpunkt_under_aldersgrans', '660400', '2026-01-01', 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html', '2026-11-07', 'Torsten'),
  (1, 'brytpunkt_over_aldersgrans', '760500', '2026-01-01', 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html', '2026-11-07', 'Torsten'),
  (1, 'skatt_aldersgrans', '66', '2026-01-01', 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html', '2026-11-07', 'Torsten'),
  (1, 'skatt_aldersgrans', '67', '2027-01-01', 'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html', '2026-11-07', 'Torsten'),
  (1, 'avgift_aldersgrans', '67', '2026-01-01', 'https://skatteverket.se/arbetsgivaravgifter', '2026-11-07', 'Torsten'),
  (1, 'arbetsgivaravgift_full', '0.3142', '2026-01-01', 'https://skatteverket.se/arbetsgivaravgifter', '2026-11-07', 'Torsten'),
  (1, 'alderspensionsavgift', '0.1021', '2026-01-01', 'https://skatteverket.se/arbetsgivaravgifter', '2026-11-07', 'Torsten'),
  (1, 'allman_pensionsavgift', '{"rate":0.07,"takIbb":8.07,"minPbb":0.423}', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'public_service', '{"rate":0.01,"takIbb":1.42}', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'skattereduktion_forvarvsinkomst', '{"lower":40000,"upper":240000,"rate":0.0075,"max":1500}', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'grundavdrag', '[{"upTo":0.99,"a":0.423,"b":0},{"upTo":2.72,"a":0.423,"b":0.2,"from":0.99},{"upTo":3.11,"a":0.77,"b":0},{"upTo":7.88,"a":0.77,"b":-0.1,"from":3.11},{"upTo":null,"a":0.293,"b":0}]', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'forhojt_grundavdrag', '[{"upTo":0.91,"a":0.687,"b":0},{"upTo":1.11,"a":0.885,"b":-0.2},{"upTo":1.965,"a":0.6,"b":0.057},{"upTo":2.72,"a":0.333,"b":0.1949},{"upTo":3.11,"a":-0.212,"b":0.3949},{"upTo":3.24,"a":-0.523,"b":0.4949},{"upTo":5.0,"a":-0.073,"b":0.356},{"upTo":7.88,"a":0.017,"b":0.338},{"upTo":8.08,"a":0.703,"b":0.251},{"upTo":11.16,"a":2.732,"b":0},{"upTo":12.84,"a":9.651,"b":-0.62},{"upTo":null,"a":1.691,"b":0}]', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'jobbskatteavdrag', '[{"upTo":0.91,"a":0,"b":1},{"upTo":3.24,"a":0.91,"b":0.3874,"from":0.91},{"upTo":8.08,"a":1.813,"b":0.251,"from":3.24},{"upTo":null,"a":3.027,"b":0}]', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'jobbskatteavdrag_aldre', '[{"upTo":1.75,"a":0,"b":0.22},{"upTo":5.24,"a":0.2635,"b":0.07},{"upTo":null,"a":0.6293,"b":0}]', '2026-01-01', 'https://www.skatteverket.se/download/18.1522bf3f19aea8075ba55c/1766385913260/teknisk-beskrivning-skv-433-2026-utgava-36.pdf', '2026-11-07', 'Torsten'),
  (1, 'sgi_tak_pbb', '10', '2026-01-01', null, null, null),
  (1, 'vaxa', '{"rate":0.1021,"capMonthly":35000,"months":24}', '2026-01-01', 'https://skatteverket.se/arbetsgivaravgifter', null, null),
  (1, 'akassa_inkomstgrans_manad', '11000', '2026-01-01', 'https://www.iaf.se', null, null),
  (1, 'akassa_aldersgrans', '67', '2026-01-01', 'https://www.iaf.se', null, null),
  (1, 'bolagsskatt', '0.206', '2026-01-01', null, null, null),
  (1, 'semesterersattning', '0.12', '2026-01-01', null, null, null),
  (1, 'dodsbo_skatteavdrag', '0.3', '2026-01-01', null, null, null),
  (1, 'prognos_upprakning_pbb', '0.02', '2027-01-01', null, '2026-11-07', 'Torsten')
;
-- checked_at = null betyder att texten ännu inte kontrollerats mot källan.
insert into konsultkoll_rule_notes (rule_version, key, title, body, source_url, checked_at) values
  (1, 'fas_a_avtal', 'Fas A i avtalet',
   'Avtalet ska tydligt ange att ersättningen i fas A är lön för utfört arbete som utbetalas vid ett senare, i avtalet fastställt tillfälle. Konsulten kan inte disponera beloppet före det datumet. Utlägg och arbetsredskap dras samma månad som kostnaden uppstår, innan beloppet avsätts till det spärrade kontot.',
   null, '2026-11-07'),
  (1, 'bolagsskatt_timing', 'Bolagsskatt på avsatt lön',
   'Det avsatta beloppet beskattas hos bolaget det år arbetet faktureras, men lönekostnaden blir avdragsgill först vid utbetalningen. Skatten kommer tillbaka utbetalningsåret, förutsatt att bolaget då har vinst att kvitta avdraget mot. Avtalet anger om bolaget bär skatten under tiden eller om den lånas ur det spärrade kontot och återbetalas.',
   null, null),
  (1, 'akassa_aldersgrans', 'A-kassans åldersgräns',
   'Från 2026 upphör rätten till a-kassa vid månadsskiftet före den månad man fyller 67. Gränsen följer riktåldern och ingen anställning kan flytta den. Exempel: född i augusti 1962 ger juli 2029 som sista månad.',
   'https://www.iaf.se', null),
  (1, 'akassa_kvalificering', 'Kvalificering för a-kassa',
   'Löpande lön i fas B gör att konsulten behåller rätten till a-kassa om uppdraget tar slut före åldersgränsen. Ersättningsperiodens längd beror på antalet månader med arbetsinkomst över inkomstgränsen (11 000 kr i månaden 2026) under det senaste året. Uppskjuten lön syns inte i arbetsgivardeklarationen förrän den betalas ut.',
   'https://www.iaf.se', null),
  (1, 'akassa_pension', 'Pension minskar a-kassan',
   'Pension och a-kassa får tillsammans inte överstiga a-kassebeloppet.',
   'https://www.iaf.se', null),
  (1, 'vaxa_villkor', 'Växa-stöd',
   'Anställningen måste omfatta minst 20 timmar per vecka i minst tre månader. Stödet gäller den första och/eller andra anställda i högst 24 kalendermånader i följd: bara ålderspensionsavgiften (10,21 %) på lön upp till 35 000 kr i månaden, full avgift över. Delägare och närstående ger inte rätt till stöd. Räknas som stöd av mindre betydelse. Från 2026 i efterhand: full avgift betalas först, sedan ansökan per kalendermånad senast ett år efter. Gäller inte den uppskjutna lönen om den betalas ut efter 24-månadersperioden.',
   'https://skatteverket.se/arbetsgivaravgifter', null),
  (1, 'avgift_aldre', 'Arbetsgivaravgift för äldre',
   'För den som fyllt 67 vid årets ingång betalas bara ålderspensionsavgiften, 10,21 %. Pensionsrätt tjänas bara in upp till intjänandetaket (8,07 inkomstbasbelopp per år), men avgiften tas ut på hela lönen.',
   'https://skatteverket.se/arbetsgivaravgifter', '2026-11-07'),
  (1, 'juridiska_sparrar', 'Juridiska spärrar',
   'Avtalet måste vara bindande och skrivet innan arbetet utförs. Konsulten får inte kunna välja när pengarna betalas ut. Lönenivån i fas B och utbetalningsåret låses i avtalet. Avtalet ska tala om lön för utfört arbete med fast belopp och fast datum, inte knytas till ålder. Konsulten är fordringsägare och lönegarantin skyddar inte hela beloppet. En särskild visstidsanställning blir tillsvidare efter mer än 12 månader inom en femårsperiod. Detta är inte skatte- eller juridisk rådgivning.',
   null, null)
;
-- Beslut 2026-11-07: arbetsgivarens andel förblir 12 %. Bolaget betalar
-- bolagsskatten på avsatta medel ur egen kassa (kontot rörs inte), och får
-- placera det spärrade kontot på fasträntekonto för att täcka den kostnaden.
insert into konsultkoll_rule_notes (rule_version, key, title, body, source_url, checked_at) values
  (1, 'nollranta_konto', 'Ingen ränta till konsulten',
   'Ingen ränta utgår till konsulten på medel som avsatts till det spärrade kontot. Bolaget får placera kontot på ett fasträntekonto; räntan är bolagets intäkt och täcker bolagets kostnad för att i förväg betala bolagsskatt på de avsatta medlen. Bindningstiden får inte löpa längre än till den avtalade utbetalningsdagen, och kontot förblir i bolagets namn och spärrat för konsulten.',
   null, '2026-11-07')
;
