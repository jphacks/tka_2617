insert into public.profiles (id, display_name)
values ('6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34', 'デモ')
on conflict (id) do nothing;

-- 手元で画面を試すためのダミーの服。画像はsupabase/seed/garments/にあり、config.tomlの[storage.buckets.garments]で入る。
-- 服だけが写る切り抜きとテクスチャを入れ、人や部屋が写る元の写真は入れない。
-- 裏面の写真（back）は、テクスチャを返すときにapiが確かめるので、裏面の切り抜きを白地に貼ったものを入れる。
-- 採寸の写真が無いので、この服では採寸とテクスチャを作り直せない。
insert into public.garments (id, profile_id, category, name, measurements, color_family, created_at)
values
  ('867f23f0-0ce1-4ba5-b56f-09d4e6db814e', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34', 'short_sleeve_top', 'JPHACKS Tシャツ', '{"shoulderWidthCm": 48, "sleeveLengthCm": 20.1, "bodyWidthCm": 51.9, "bodyLengthCm": 72.8, "waistCm": null, "hipCm": null, "thighWidthCm": null, "riseCm": null, "inseamCm": null, "hemWidthCm": null}', 'black', '2026-10-18 09:00:00+09'),
  ('ac721785-975d-4a53-acb0-80a18dedb3a8', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34', 'short_sleeve_top', 'パジャマ', '{"shoulderWidthCm": 40.8, "sleeveLengthCm": 18.6, "bodyWidthCm": 46.6, "bodyLengthCm": 65, "waistCm": null, "hipCm": null, "thighWidthCm": null, "riseCm": null, "inseamCm": null, "hemWidthCm": null}', 'gray', '2026-10-18 09:01:00+09'),
  ('5a7d526e-a05e-4167-8739-117f956466ce', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34', 'trousers', 'ストライプスラックス', '{"shoulderWidthCm": null, "sleeveLengthCm": null, "bodyWidthCm": null, "bodyLengthCm": null, "waistCm": 80.8, "hipCm": 106.1, "thighWidthCm": 28, "riseCm": 35.4, "inseamCm": 70.4, "hemWidthCm": 33.3}', 'black', '2026-10-18 09:02:00+09'),
  ('a470ce91-a738-40ee-8ce7-c2ae250b1699', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34', 'trousers', 'スラックス', '{"shoulderWidthCm": null, "sleeveLengthCm": null, "bodyWidthCm": null, "bodyLengthCm": null, "waistCm": 61.3, "hipCm": 95.8, "thighWidthCm": 21.6, "riseCm": 32.2, "inseamCm": 62.3, "hemWidthCm": 31.6}', 'black', '2026-10-18 09:03:00+09')
on conflict (id) do nothing;

insert into public.garment_materials (garment_id, material_id, percent)
values
  ('867f23f0-0ce1-4ba5-b56f-09d4e6db814e', 'cotton', 100),
  ('ac721785-975d-4a53-acb0-80a18dedb3a8', 'cotton', 100),
  ('5a7d526e-a05e-4167-8739-117f956466ce', 'cotton', 100),
  ('a470ce91-a738-40ee-8ce7-c2ae250b1699', 'cotton', 100)
on conflict (garment_id, material_id) do nothing;

insert into public.garment_images (id, garment_id, storage_key, role, width_px, height_px, texture_job, created_at)
values
  ('ae33b8d4-134d-4bf8-a143-4b9d4c08b1be', '867f23f0-0ce1-4ba5-b56f-09d4e6db814e', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/867f23f0-0ce1-4ba5-b56f-09d4e6db814e/cutout.png', 'cutout', 1074, 923, null, '2026-10-18 09:00:00+09'),
  ('f8211456-f88d-48a8-9886-fddbf96a5c4b', '867f23f0-0ce1-4ba5-b56f-09d4e6db814e', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/867f23f0-0ce1-4ba5-b56f-09d4e6db814e/back.jpg', 'back', 1171, 989, null, '2026-10-18 09:00:10+09'),
  ('1de2b66e-ce87-4a01-93a0-5dbcc4bf728a', '867f23f0-0ce1-4ba5-b56f-09d4e6db814e', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/867f23f0-0ce1-4ba5-b56f-09d4e6db814e/back_cutout.png', 'back_cutout', 1171, 989, null, '2026-10-18 09:00:10+09'),
  ('268e7659-c186-4d8c-acef-20053e6765dd', '867f23f0-0ce1-4ba5-b56f-09d4e6db814e', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/867f23f0-0ce1-4ba5-b56f-09d4e6db814e/texture.png', 'texture', 2048, 2048, 'seed', '2026-10-18 09:00:20+09'),
  ('05bf05ef-6494-4119-a6b2-5ffc79e7fabd', 'ac721785-975d-4a53-acb0-80a18dedb3a8', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/ac721785-975d-4a53-acb0-80a18dedb3a8/cutout.png', 'cutout', 978, 900, null, '2026-10-18 09:01:00+09'),
  ('9fad8348-09a0-49f4-b52a-017e659c2205', 'ac721785-975d-4a53-acb0-80a18dedb3a8', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/ac721785-975d-4a53-acb0-80a18dedb3a8/back.jpg', 'back', 1035, 909, null, '2026-10-18 09:01:10+09'),
  ('e8f4c65b-e820-4d8d-bf97-2b38f372a817', 'ac721785-975d-4a53-acb0-80a18dedb3a8', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/ac721785-975d-4a53-acb0-80a18dedb3a8/back_cutout.png', 'back_cutout', 1035, 909, null, '2026-10-18 09:01:10+09'),
  ('e3867915-8851-4c08-8e0d-da745752c14c', 'ac721785-975d-4a53-acb0-80a18dedb3a8', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/ac721785-975d-4a53-acb0-80a18dedb3a8/texture.png', 'texture', 2048, 2048, 'seed', '2026-10-18 09:01:20+09'),
  ('4d9593b2-f0f7-453b-870a-035c9e85074b', '5a7d526e-a05e-4167-8739-117f956466ce', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/5a7d526e-a05e-4167-8739-117f956466ce/cutout.png', 'cutout', 534, 772, null, '2026-10-18 09:02:00+09'),
  ('f04a4df4-aefc-412f-85ba-2ed567d978bc', '5a7d526e-a05e-4167-8739-117f956466ce', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/5a7d526e-a05e-4167-8739-117f956466ce/back.jpg', 'back', 557, 800, null, '2026-10-18 09:02:10+09'),
  ('aa5191ef-95e0-4e90-aad6-12a6fef97836', '5a7d526e-a05e-4167-8739-117f956466ce', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/5a7d526e-a05e-4167-8739-117f956466ce/back_cutout.png', 'back_cutout', 557, 800, null, '2026-10-18 09:02:10+09'),
  ('784f84e5-49de-44cb-9e5b-5a0ecdd69359', '5a7d526e-a05e-4167-8739-117f956466ce', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/5a7d526e-a05e-4167-8739-117f956466ce/texture.png', 'texture', 2048, 2048, 'seed', '2026-10-18 09:02:20+09'),
  ('eae3e655-97ee-4562-97d6-0ea44458d918', 'a470ce91-a738-40ee-8ce7-c2ae250b1699', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/a470ce91-a738-40ee-8ce7-c2ae250b1699/cutout.png', 'cutout', 698, 972, null, '2026-10-18 09:03:00+09'),
  ('90bc9263-5326-476d-9d2f-b4e08f4ad0b0', 'a470ce91-a738-40ee-8ce7-c2ae250b1699', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/a470ce91-a738-40ee-8ce7-c2ae250b1699/back.jpg', 'back', 877, 1151, null, '2026-10-18 09:03:10+09'),
  ('c8c8aee8-490c-40c5-8634-4ca3532a6386', 'a470ce91-a738-40ee-8ce7-c2ae250b1699', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/a470ce91-a738-40ee-8ce7-c2ae250b1699/back_cutout.png', 'back_cutout', 877, 1151, null, '2026-10-18 09:03:10+09'),
  ('66a0b5b2-eadc-4380-8493-9faee0c1c339', 'a470ce91-a738-40ee-8ce7-c2ae250b1699', '6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34/a470ce91-a738-40ee-8ce7-c2ae250b1699/texture.png', 'texture', 2048, 2048, 'seed', '2026-10-18 09:03:20+09')
on conflict (id) do nothing;
