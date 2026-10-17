alter table public.garment_images drop constraint garment_images_role_check;
alter table public.garment_images add constraint garment_images_role_check
  check (role in ('original', 'measurement', 'cutout'));

update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'garments';

alter table public.garments alter column measurement_version
  set default 'df2-a4-flat-midpoint-v2';
