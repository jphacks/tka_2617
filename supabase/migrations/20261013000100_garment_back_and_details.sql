-- 裏面の写真は表とは別のroleで持ち、一覧には出さない。
alter table public.garment_images drop constraint garment_images_role_check;
alter table public.garment_images add constraint garment_images_role_check
  check (role in ('original', 'measurement', 'cutout', 'back', 'back_cutout'));

-- 購入時期は日付まで覚えていないことが多いため、年月だけを持つ。
alter table public.garments
  add column purchased_month text
    check (purchased_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  add column seasons text[] not null default '{}'
    check (seasons <@ array['spring', 'summer', 'autumn', 'winter']::text[]);
