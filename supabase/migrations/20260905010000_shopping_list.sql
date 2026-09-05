-- Inköpslista — a flag on a regular item, same idea as "Prioriterad" or
-- being scheduled into Dagens Fokus: it doesn't replace the item's normal
-- status/workflow, it just also shows up in a dedicated Shoppinglista view
-- until checked off (which marks it done like anywhere else in the app).

alter table items
  add column in_shopping_list boolean not null default false;
