-- シャツは長そでと同じ寸法項目を使い、着せる3Dモデルを分けるためにカテゴリだけを追加する。
alter table public.garments drop constraint garments_category_check;
alter table public.garments add constraint garments_category_check
  check (category in ('short_sleeve_top', 'long_sleeve_top', 'shirt', 'trousers'));
