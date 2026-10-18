-- 採寸画面で確かめた服の範囲。テクスチャを作るときに推論サービスへ渡し、服の検出をやり直さない（ADR 0052）。
-- measurement画像の座標の[x1, y1, x2, y2]。前からある写真と、measurement以外の写真はnull。
alter table public.garment_images
  add column bbox jsonb
    check (bbox is null or (jsonb_typeof(bbox) = 'array' and jsonb_array_length(bbox) = 4));
