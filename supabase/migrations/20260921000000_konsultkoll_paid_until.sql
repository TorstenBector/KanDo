-- KonsultKoll betalning: 7 dagars gratis test räknas från auth.users.created_at
-- (ingen egen kolumn behövs för det). paid_until sätts av stripe-webhook när
-- en engångsbetalning (365 dagar) går igenom. NULL = aldrig betalat.
alter table konsultkoll_settings
  add column paid_until timestamptz;
