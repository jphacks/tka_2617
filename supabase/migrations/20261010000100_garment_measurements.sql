-- 画像・採寸値はAPIだけが扱う。新規テーブルのRLSには公開ポリシーを設けない。
create table public.profiles (
  id uuid primary key,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.garments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  category text not null check (category in ('short_sleeve_top', 'trousers')),
  name text not null default '' check (char_length(name) <= 100),
  measurements jsonb not null default '{}'::jsonb check (jsonb_typeof(measurements) = 'object'),
  measurement_version text not null default 'df2-a4-midpoint-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.garment_images (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garments(id) on delete cascade,
  storage_key text not null unique,
  role text not null check (role in ('original', 'measurement')),
  width_px integer not null check (width_px between 1 and 4096),
  height_px integer not null check (height_px between 1 and 4096),
  points jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array'),
  pixels_per_cm double precision check (pixels_per_cm between 2 and 100),
  paper_corners jsonb not null default '[]'::jsonb,
  model_version text,
  created_at timestamptz not null default now(),
  unique (garment_id, role)
);
create index garments_profile_created on public.garments(profile_id, created_at desc);
create index garment_images_garment on public.garment_images(garment_id);
alter table public.profiles enable row level security;
alter table public.garments enable row level security;
alter table public.garment_images enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garments', 'garments', false, 8388608, array['image/jpeg']);
