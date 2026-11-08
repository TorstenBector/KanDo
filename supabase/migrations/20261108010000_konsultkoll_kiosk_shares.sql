-- KonsultKoll — konsultläge på arbetsgivarens dator.
-- Ett upplägg som konsulten sparar i konsultläget hamnar direkt under
-- Delade upplägg, under arbetsgivarens inloggning, och märks med kiosk.
-- Att lämna konsultläget kräver arbetsgivarens PIN via den befintliga
-- konsultkoll_unlock_employer (samma spärr efter fem fel).
alter table konsultkoll_deferred_shares add column kiosk boolean not null default false;
