-- Sparad tjänstebils-mall för "Räkna på uppdrag"s Overhead-meny (samma
-- fält som Konsult vs Konsult redan räknar med, se src/lib/carBenefit.ts
-- i KonsultKoll-repot). JSONB eftersom fälten kan växa/ändras utan ny
-- migration för varje litet tillägg, precis som overhead_items.
alter table konsultkoll_settings
  add column car_benefit jsonb not null default '{}'::jsonb;
