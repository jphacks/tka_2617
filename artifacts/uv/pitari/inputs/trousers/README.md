# 受領したズボンの素材

2026-10-15にリポジトリ直下から移動した。モデルとUVは変更していない。

- `pitari_trousers.blend`：`jeans`と`avatar`。ズボンは1462頂点・1432面・5728面コーナー。
- `trousers_male.glb`：ズボン単体。体型・身長・服の寸法のシェイプキー11個を持つ。
- `uv_layout_UVMap.svg`・`uv_layout_UVMap.png`：2048×2048のUV展開図。
- `mesh_info.json`：受領したメッシュ情報。書かれたハッシュは、提供元の値として残す。
- `trousers_landmarks.json`：採寸用の頂点番号。UVの切れ目とは位置が異なる。
- `ジーンズ表面.jpg`・`ジーンズ背面.jpg`：貼り付けに使った写真。

写真・PNG・SVG・GLB・Blenderファイルは、`.gitignore`で除外している。Gitだけではそろわないので、このフォルダに別に置く。

生成手順と検証結果は[UVテンプレートのREADME](../../README.md#ズボン)を参照する。新しいテクスチャと確認用モデルは`../../trials/jeans_new_uv/`にある。
