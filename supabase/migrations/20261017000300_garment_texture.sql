-- 推論サービスが作ったテクスチャを、apiが受け取って服の画像の1つ（role = texture）として持つ。
alter table public.garment_images drop constraint garment_images_role_check;
alter table public.garment_images add constraint garment_images_role_check
  check (role in ('original', 'measurement', 'cutout', 'back', 'back_cutout', 'texture'));

alter table public.garment_images
  add column texture_job text,
  add constraint garment_images_texture_job_check
    check ((role = 'texture') = (texture_job is not null));
comment on column public.garment_images.texture_job is
  'テクスチャを作った推論サービスの作業フォルダ名。同じ作業を2回保存しないために使う。texture以外の画像はnull';

-- 2048pxのテクスチャはPNGで8MiBを超えることがある。利用者が上げる写真の大きさは、apiが別に確かめる。
update storage.buckets set file_size_limit = 16777216 where id = 'garments';

-- テクスチャの差し替えを1つのトランザクションで行う。服の行をロックするので、同時に届いても順番に処理される。
-- 戻り値は、今のテクスチャの画像IDと、Storageから消す画像のキー。
-- 同じ作業がすでに保存されていれば、行は変えず、今回上げた画像のキーを消す側として返す。
create function public.save_garment_texture(
  target_garment_id uuid,
  target_profile_id uuid,
  new_image jsonb
)
returns table (image_id uuid, removed_key text)
language plpgsql
set search_path = ''
as $$
declare
  saved public.garment_images;
  new_id uuid;
begin
  perform 1
  from public.garments
  where id = target_garment_id and profile_id = target_profile_id
  for update;
  if not found then
    raise exception 'garment not found' using errcode = 'P0002';
  end if;

  select * into saved
  from public.garment_images
  where garment_id = target_garment_id and role = 'texture';
  if saved.texture_job = new_image ->> 'texture_job' then
    return query select saved.id, new_image ->> 'storage_key';
    return;
  end if;

  delete from public.garment_images
  where garment_id = target_garment_id and role = 'texture';
  insert into public.garment_images (garment_id, storage_key, role, width_px, height_px, texture_job)
  values (
    target_garment_id,
    new_image ->> 'storage_key',
    'texture',
    (new_image ->> 'width_px')::integer,
    (new_image ->> 'height_px')::integer,
    new_image ->> 'texture_job'
  )
  returning id into new_id;
  return query select new_id, saved.storage_key;
end;
$$;

-- 公開APIのanon・authenticatedからは呼ばせず、apiのsecret keyだけが使う。
revoke execute on function public.save_garment_texture(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_garment_texture(uuid, uuid, jsonb) to service_role;
