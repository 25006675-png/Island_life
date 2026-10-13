-- Things for Blomy to wear (src/shop.js ITEMS with wear: true). They're bought
-- like everything else in the shop -- once, checked by buy() -- so only the
-- price list grows. Whether she has one on is kept in the browser, not here.

insert into public.shop_items (id, cost) values
  ('scarf', 35), ('bow', 45), ('sunhat', 55);
