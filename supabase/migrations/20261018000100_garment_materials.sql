-- 服の素材の一覧。画面ではsort_orderの順に並べる。
create table public.materials (
  id text primary key check (id ~ '^[a-z_]+$'),
  label text not null,
  sort_order smallint not null unique
);
alter table public.materials enable row level security;

insert into public.materials (id, label, sort_order) values
  ('cotton', '綿', 1),
  ('polyester', 'ポリエステル', 2),
  ('wool', 'ウール', 3),
  ('linen', '麻', 4),
  ('nylon', 'ナイロン', 5),
  ('rayon', 'レーヨン', 6),
  ('acrylic', 'アクリル', 7),
  ('polyurethane', 'ポリウレタン', 8),
  ('silk', 'シルク', 9),
  ('cashmere', 'カシミヤ', 10),
  ('other', 'その他', 11);

-- 服の素材の混率（綿98%・ポリウレタン2%など）。合計100%は、差し替えの関数で確かめる。
create table public.garment_materials (
  garment_id uuid not null references public.garments (id) on delete cascade,
  material_id text not null references public.materials (id),
  percent smallint not null check (percent between 1 and 100),
  primary key (garment_id, material_id)
);
alter table public.garment_materials enable row level security;

-- 素材を足す前に登録した服は、素材を入れなかった服と同じく綿100%にする。
insert into public.garment_materials (garment_id, material_id, percent)
select id, 'cotton', 100 from public.garments;

-- 服の素材をまとめて差し替える。服の行をロックするので、同時に届いても順番に処理される。
-- new_materialsは[{ "material_id": "cotton", "percent": 98 }, ...]。
create function public.set_garment_materials(
  target_garment_id uuid,
  target_profile_id uuid,
  new_materials jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1
  from public.garments
  where id = target_garment_id and profile_id = target_profile_id
  for update;
  if not found then
    raise exception 'garment not found' using errcode = 'P0002';
  end if;
  if (select coalesce(sum((value ->> 'percent')::integer), 0) from jsonb_array_elements(new_materials)) <> 100 then
    raise exception 'materials must total 100 percent' using errcode = '23514';
  end if;

  delete from public.garment_materials where garment_id = target_garment_id;
  insert into public.garment_materials (garment_id, material_id, percent)
  select target_garment_id, value ->> 'material_id', (value ->> 'percent')::smallint
  from jsonb_array_elements(new_materials);
end;
$$;

revoke execute on function public.set_garment_materials(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_garment_materials(uuid, uuid, jsonb) to service_role;
