# 長そでの受領素材

`longsleeve_male.glb`、`longsleeve_landmarks.json`、`mesh_info.json`、`uv_layout_pitari.svg`は受領データ。ローカルの`pitari_longsleeve.blend`・バックアップ・UV画像・確認画像も同じフォルダへ移した。元ファイルの内容は変更していない。GLB・SVG・画像・Blenderファイルは、`.gitignore`で除外している。このフォルダに別に置く。

## テンプレートの再生成

リポジトリ直下のPowerShellで実行する。Blenderは元ファイルを保存しない。

```powershell
& "C:/Program Files/Blender Foundation/Blender 4.3/blender.exe" -b artifacts/uv/pitari/inputs/longsleeve/pitari_longsleeve.blend --python-exit-code 1 --python artifacts/uv/pitari/scripts/export_longsleeve_mesh.py
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/build_template.py --category long_sleeve_top
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/verify_longsleeve_assets.py
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/selftest_synthetic.py --category long_sleeve_top
```

出力は`artifacts/uv/pitari/longsleeve/`。`uv_template.json`と`masks/`を推論サービスが読み込む。検証画像は`check/`、検証結果は`data/`、合成写真の結果は`../trials/selftest_long_sleeve_top/`に保存する。テンプレートを作ったあとは、サービスを起動し直さずに生成に使える。ただし、今回のカテゴリに対応するコードを読み込むには、推論サービスを起動し直す。

手動で表裏写真から生成する場合：

```powershell
./apps/inference/.venv/Scripts/python.exe artifacts/uv/pitari/scripts/photo_to_texture.py --category long_sleeve_top --front 前面.jpg --back 背面.jpg --out artifacts/uv/pitari/trials/longsleeve
```

## 確認結果と制約

- 3942頂点・3848面。GLBの座標とUVがBlenderのBasisと一致し、7696三角形・12シェイプキーを保持している。
- SVGとメッシュのUVの誤差は最大0.0005px未満。
- 元のUVに148テクセルの重なりがある。背面袖の小島は背面として扱い、元のUVを変えない。重なる部分には、違う写真の色を同時に割り当てられない。
- 合成の表裏写真と正解の点で変換を確認。UV弧長設定では裏返った三角形0、写真色95.64%、近傍補完4.36%、未充填0%。実写の精度を示す数値ではない。
- 既存HRNetをCPUで実行し、合成画像に対して長そでの1〜33番を返すことを確認した。実写の分類・採寸・柄の再現精度は、まだ確かめていない。
- ローカルDBへmigrationを適用し、BFF経由の合成写真の推論・透過画像付き登録・一覧・詳細・裏面保存・テクスチャ生成まで確認。生成は約85秒で完了し、未充填0%。検証用の服は削除済み。結果は`../../trials/selftest_long_sleeve_top/integration_report.json`に記録した。
- 実際の袖は重ねずに広げ、袖口まで撮影する。受領した3D用ランドマークは頂点番号であり、写真のDeepFashion2番号とは別に扱う。
