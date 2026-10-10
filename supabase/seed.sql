insert into public.profiles (id, display_name)
values ('6f1c2b9e-3d4a-4f6b-9c2e-1a7d5e8b0c34', 'デモ')
on conflict (id) do nothing;
