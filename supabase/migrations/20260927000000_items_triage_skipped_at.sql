-- "Behåll i Backlog" (svep vänster i Triage) ska få kortet att sjunka till
-- botten av Backlog tills något ändras på det (KanDo Vibe #7356). Sätts till
-- samma tidpunkt som updated_at; kortet räknas som nedsänkt så länge
-- triage_skipped_at >= updated_at — varje senare ändring (som alltid bumpar
-- updated_at) lyfter det tillbaka automatiskt, utan att någon behöver nolla
-- fältet.
alter table items add column triage_skipped_at timestamptz;
