# シャツの受領素材

2026-10-17にリポジトリ直下から移した。元ファイルの内容は変更していない。

- `pitari_shirt.blend`：シャツ（`shirt`）のBlenderファイル。1613頂点・1544面。MakeHumanの`male_casualsuit03`のシャツの部分
- `shirt_male.glb`：シャツ単体。アプリの`apps/web/public/models/shirt_male.glb`と同じファイル（SHA-256が一致）
- `uv_layout_pitari.svg`・`uv_layout_pitari.png`：2048×2048のUV展開図（UVは`pitari`）
- `check_grid_front.png`・`check_grid_back.png`：UVの確認用の格子画像
- `mesh_info.json`：受領したメッシュ情報。記載されたハッシュは提供元の値として保持する
- `shirt_landmarks.json`：3D用の頂点番号。長そでの`longsleeve_landmarks.json`と同じ項目に、前立て（`front_edge`）・前身頃（`front_panels`）・襟（`collar_verts`）を足したもの。写真のDeepFashion2の番号とは別物

Gitで共有するのは、このREADME・`mesh_info.json`・`shirt_landmarks.json`だけ。Blenderファイル・GLB・SVG・画像は`.gitignore`で除外しているため、別途このフォルダに配置する。

## テンプレートの再生成

リポジトリ直下のPowerShellで実行する。Blenderは元ファイルを保存しない。

```powershell
& "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b artifacts/uv/pitari/inputs/shirt/pitari_shirt.blend --python-exit-code 1 --python artifacts/uv/pitari/scripts/export_shirt_mesh.py
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/build_shirt_template.py
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/verify_shirt_assets.py
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/selftest_synthetic.py --category shirt
```

出力は`artifacts/uv/pitari/shirt/`。`uv_template.json`と`masks/`を推論サービスが読み込む。部位と三角形の確認画像は`check/template_parts.png`、検証結果は`data/`、合成写真の結果は`../trials/selftest_shirt/`に保存する。テンプレートを作った後は推論サービスの再起動なしで生成に使える。

手動で表裏写真から生成する場合：

```powershell
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/photo_to_texture.py --category shirt --front 前面.jpg --back 背面.jpg --out artifacts/uv/pitari/trials/shirt
```

## 作り方（[ADR 0034](../../../../../docs/adr/0034-shirt-texture-from-projected-uv.md)）

pitari UVは、前の面を正面から、後ろの面を背面からまっすぐ投影したもの。平置きの写真もほぼ真上から見た形なので、UVの前後の島の外周を写真の服の輪郭に合わせる。

- 固定点：肩先・脇・袖口の上下・裾の端・襟の付け根を、3D用のランドマークから投影してUVの外周に置く。裾と後ろ襟の中心は外周の中点、前の襟元の中心はV字の一番下
- 部位：前後それぞれ身頃と左右の袖。袖付けは3Dの袖と身頃の境目の曲線
- 前の襟元：襟の付け根（2・6番）からV字の一番下（4番）までを直線で区切る。それより上の襟の先は近くの色で補う
- 写真の検出・点・切り抜きは長そで（`long_sleeve_top`）として行う。DeepFashion2の番号の対応も長そでと同じ

## 確認結果と制約（2026-10-17）

- 1613頂点・1544面。GLBの座標とUVがBlenderのBasisと一致し、3088三角形・15シェイプキーを保持している
- SVGとメッシュのUVの誤差は最大0.0005px
- テンプレートの三角形がUVの99.1%を覆う。残りは前の襟の先など
- 合成の表裏写真と正解の点で、裏返った三角形0、写真色93.6%、近傍補完6.4%、未充填0%、色の差の平均5.25。長そでの同じテスト（9.77）と同じ水準
- 同じ合成写真で既存のHRNetを長そでとして動かすと、色の差の平均28.7（長そでは27.8）、背面で裏返った三角形3。実写の分類・点・柄の再現精度は未検証。とくに襟元の2・4・6番の位置は実写で確かめる
- 写真はボタンを留めて襟を整え、袖を身頃と重ならないように広げ、両方の袖口と裾まで写す
