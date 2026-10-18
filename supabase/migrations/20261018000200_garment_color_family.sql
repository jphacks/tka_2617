-- 服の色の系統。登録したときに、同じ系統の服が何着あるかを出すのに使う（ADR 0044）。
-- 切り抜きの色からブラウザで決める。前からある服と、色を決められなかった服はnull。
alter table public.garments
  add column color_family text
    check (color_family in (
      'white', 'black', 'gray', 'navy', 'beige', 'brown', 'red',
      'pink', 'orange', 'yellow', 'green', 'blue', 'purple'
    ));
