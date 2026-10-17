-- テクスチャを保存するとき、作業のもとになった裏面が今の裏面かを、服の行のロックの中で確かめ直す。
-- apiが状態を確かめてから保存するまでの間に裏面が撮り直されると、古い写真のテクスチャを今のものとして保存してしまうため。
-- 裏面が違えば行は変えず、image_idをnullにして、今回上げた画像のキーを消す側として返す。
drop function public.save_garment_texture(uuid, uuid, jsonb);

create function public.save_garment_texture(
  target_garment_id uuid,
  target_profile_id uuid,
  expected_back_image_id uuid,
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

  if not exists (
    select 1
    from public.garment_images
    where garment_id = target_garment_id and role = 'back' and id = expected_back_image_id
  ) then
    return query select null::uuid, new_image ->> 'storage_key';
    return;
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
revoke execute on function public.save_garment_texture(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_garment_texture(uuid, uuid, uuid, jsonb) to service_role;
