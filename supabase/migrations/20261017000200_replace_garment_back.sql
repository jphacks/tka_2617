-- 裏面の差し替えを1つのトランザクションで行う。途中で失敗しても、新しい裏面と古い切り抜きが組にならない。
-- 服の行をロックするので、同じ服への同時の差し替えは順番に処理される。
-- 戻り値は差し替えで外れた古い画像の保存キー。Storageからの削除はapiが行う。
create function public.replace_garment_back(
  target_garment_id uuid,
  target_profile_id uuid,
  new_images jsonb
)
returns table (removed_key text)
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
  if exists (
    select 1
    from jsonb_array_elements(new_images) as image
    where image ->> 'role' not in ('back', 'back_cutout')
  ) then
    raise exception 'only back images can be replaced' using errcode = '22023';
  end if;

  return query
    with removed as (
      delete from public.garment_images
      where garment_id = target_garment_id and role in ('back', 'back_cutout')
      returning storage_key
    )
    select storage_key from removed;

  insert into public.garment_images (garment_id, storage_key, role, width_px, height_px)
  select
    target_garment_id,
    image ->> 'storage_key',
    image ->> 'role',
    (image ->> 'width_px')::integer,
    (image ->> 'height_px')::integer
  from jsonb_array_elements(new_images) as image;
end;
$$;

-- 公開APIのanon・authenticatedからは呼ばせず、apiのsecret keyだけが使う。
revoke execute on function public.replace_garment_back(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_garment_back(uuid, uuid, jsonb) to service_role;
