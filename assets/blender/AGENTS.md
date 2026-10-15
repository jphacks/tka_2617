# assets/blenderのルール

Blender 4.2＋MPFB2 2.0.17で、男性アバターとTシャツのglbを作るスクリプト。身長・体型と実寸（cm）に合わせてTシャツを変形させる。

## ファイル

- `build_tshirt.py`：入口。アバターとTシャツを作り、`apps/web/public/models/`に書き出す
- `verify_sizes.py`：サイズ合わせの検証と、確認用の画像（`out/renders/`）
- `pitari_tshirt.py`：共通処理（生成・基準点・計測・シェイプキー・書き出し）
- `build_presets.py`：入口。髪4種と靴を作り、`apps/web/public/presets/`に書き出す
- `render_presets.py`：プリセットの確認。書き出したglbを重ねて、サムネイル（`apps/web/public/presets/thumbs/`）と体型ごとの確認画像（`out/presets/builds_check.png`）を描き、めり込みを数える
- `pitari_presets.py`：プリセットの共通処理（素材の選択・灰色のテクスチャ・材質）。`build_tshirt.py`も体の肌と`_shoe`に使う
- `out/`：生成物（`tshirt_landmarks.json`、確認用の`build.blend`、`renders/`）。gitに入れない

## 再生成と検証（リポジトリのルートで）

```
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/build_tshirt.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background assets/blender/out/build.blend --python assets/blender/verify_sizes.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/build_presets.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/render_presets.py
```

- プリセットの生成は約20秒、確認は約3分。確認は`build_tshirt.py`の体（`avatar_male.glb`）を読むので、体を作り直したら確認もやり直す

- 生成は約30〜50秒、検証は約40秒（画像の書き出しを含む）
- 検証は標準体型±0.5cm、ほかの体型±1cmで合否を出し、不合格なら終了コード1。身長は標準と150〜195cmの8点で確かめる
- 生成スクリプトは、途中でPythonのエラーが出てもBlenderが終了コード0を返す。ログの`[pitari] 完了`で終わったかを見る
- MPFB2はBlenderの拡張機能として有効にしておく（Pythonからは`bl_ext.blender_org.mpfb`でimport）
- 衣服のアセットのパスは`pitari_tshirt.py`の`MHCLO`に直書きしてある（`C:\MakeHuman\data\clothes\male_casualsuit06\male_casualsuit06.mhclo`）。別のPCで動かすなら直す

## 出力（apps/web/public/models/）

| ファイル                      | 中身                                                                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `avatar_male.glb`             | 体。体型キー3個＋身長キー2個＋頂点属性`_cover`（服の下の重み0〜1。1は服で完全に覆われる所）と`_shoe`（靴で隠れる所が1）。肌は明暗だけの灰色のテクスチャ（ブラウザで肌の色を掛ける） |
| `tshirt_male.glb`             | Tシャツ。体型キー3個＋身長キー2個＋サイズキー4個                                                                                                                                    |
| `tshirt_male_height.json`     | 標準の身長（`standard_cm`）と、体型・身長（150、160、標準、185、195cm）ごとの基準寸法、キーの効き方`m`（4項目×4キー）、体の身幅`body_width`。webはこれを使う                        |
| `tshirt_male_base.json`       | 標準の身長での体型ごとの基準寸法（cm）。webは使っていない                                                                                                                           |
| `tshirt_male_correction.json` | 標準の身長での体型ごとのキーの効き方`m`。webは使っていない                                                                                                                          |

生成物だが、Vercelでは再生成できないのでcommitする。

## 決まりごと

- キー名・単位・寸法の定義を変えるときは、先にユーザーに相談する
- Blenderの単位はメートル。計測結果だけcm
- サイズキーは`size_length`／`size_width`／`size_shoulder`／`size_sleeve`。値1.0＝+1cm
  - +10cmの形を作り、値0.1でNew Shape from Mixして1cmキーにする
  - サイズキーには体からの押し出しを入れない。押し出しはブラウザ（`push-out.ts`）が毎回するので、キーは服の形の変化だけにする
  - Blenderのスライダーは±10が上限（受け入れ済み）。glTFとブラウザ側は無制限
- 体型は細身／標準／がっしり／ぽっちゃりの4つ。キーは`build_slim`／`build_broad`／`build_chubby`。標準体型＝Basis。同時に1つだけ1.0
  - 体型はMPFBのマクロ`weight`／`muscle`だけ変える（`pitari_tshirt.BUILD_MACROS`）。がっしり＝筋肉、ぽっちゃり＝体重
- 身長キーは`height_up`／`height_down`。標準体型の身長（MPFBのマクロ`height`0.5、172.91cm）からの差で、値1.0＝1cm。高ければ`height_up`、低ければ`height_down`だけを使う
  - MPFBはマクロ`height`0.5を境に低い側と高い側で別の形を混ぜるので、キーを2つに分ける。それぞれの側では身長がマクロに比例する
  - 実測の身長差が±20cmになるマクロを探して体を作り、mhcloでTシャツを着せ直して、1/20倍で1cmキーにする（`HEIGHT_SPAN_CM`）
  - 入力できる身長は150〜195cm。体型キーと身長キーは足し合わせて使う（近似）
- TシャツはMPFBの`male_casualsuit06`の先頭2822頂点（後ろはジーンズなので削除）。体型ごとの形はmhcloで着せ直して作る
- 突き抜け対策は「服を体の外へ押し出す」だけにする（[ADR 0007](../../docs/adr/0007-push-shirt-out-only.md)）。体は変形させない
  - 体から8mm未満の服の頂点を外へ押し出してなだらかに広げ、服で完全に覆われる体（`_cover`が0.99以上）が服の外へ出ていれば、その面の頂点をさらに外へ足す
  - 同じ計算をwebの`apps/web/src/lib/push-out.ts`と`verify_sizes.push_out_e`に持っている。変えるときは両方

## 寸法の定義（`pitari_tshirt.measure`）

入力の4項目は、DeepFashion2の半袖トップスの点（measureの`measurementDefinitions.short_sleeve_top`）に合わせる。

| 項目                               | DeepFashion2の点 | 3Dでの測り方                                                                                                                                                              |
| ---------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 着丈 length（`bodyLengthCm`）      | 1→16             | 後ろ襟ぐり中心→背中の中心線→裾（固定の頂点列）                                                                                                                            |
| 身幅 width（`bodyWidthCm`）        | 12→20            | 脇の下（袖の縫い目の最下点）の高さで胴を水平に切った一周÷2。脇の頂点の近くは不安定なので1cm下で切る。切り口で120°より鋭く折り返す点（脇の縫い目の小さな折れ）は除いて測る |
| 肩幅 shoulder（`shoulderWidthCm`） | 7→25             | 左右の肩先と「後ろ襟ぐり中心の2cm下」を通る平面で背中を切った線（標準体型で横切る辺を固定）                                                                               |
| 袖丈 sleeve（`sleeveLengthCm`）    | 7→9              | 肩先→袖の上側→袖口（固定の頂点列、左右平均）                                                                                                                              |

基準点はUVの島（前身頃・後ろ身頃・左右の袖）と縁のループから自動で求め、`out/tshirt_landmarks.json`に頂点インデックスで保存する。

## webでの使い方（apps/web）

- 服が着られるかは身幅だけで決める（`fitStatus`）。体の身幅（服の身幅と同じ高さで体を切った胴の一周÷2、`tshirt_male_height.json`の`body_width`）以上ならそのまま、体の身幅より小さく90%以上なら「タイト」、それより小さければ「小さすぎます」と出して服を表示しない（伸び率`STRETCH_RATIO`＝10%）
- 型は`src/lib/garment.ts`にzodで定義する（`GarmentSchema`、`MeasurementsSchema`、`HeightTableSchema`）
  - `GarmentSchema`はチーム共通の服データ形式（仮）。`tshirtMeasurements(garment)`で4項目に変換する。形式が確定したら差し替える
- morph targetは`src/lib/morph.ts`の`setMorph(root, name, value)`で名前から引く。インデックスを直書きしない
- 体型キー：`buildKeyValues(build)`（選んだ体型だけ1、体とTシャツの両方に入れる）
- 身長キー：`heightKeyValues(身長, table)`（体とTシャツの両方に入れる）
- サイズキー：`fitAt(build, 身長, table)`で前後の身長の基準寸法とMを直線で補間し、`sizeKeyValues(実寸, fit, table)`がM（4×4）×キー＝（実寸−その体型・身長の基準寸法）を解く。同じ計算を`verify_sizes.fit_at`と`key_values`に持っている
- 服の押し出しは`src/lib/push-out.ts`（three-mesh-bvh）。スマホでは1回0.3〜0.4秒かかるので、入力が止まってから（0.3秒後に）計算する。検証スクリプトは押し出した後の寸法のずれを出す（合否には使わない）
- 確認ページは`/dev/tryon`（`src/app/dev/tryon/`）

## プリセット（髪・靴、`apps/web/public/presets/`）

- 素材はMakeHuman system assetsのCC0のものだけ。使った素材は`apps/web/public/presets/LICENSES.md`に記録する。選んだ素材は`pitari_presets.HAIR`／`SHOES`
- 髪・靴は体と同じ原点・スケールで、体と同じ体型キー3個＋身長キー2個を持つ（骨格は使わない。[ADR 0010](../../docs/adr/0010-presets-follow-body-with-shape-keys.md)）。ブラウザで体と同じ値を入れれば重なる
- 色はブラウザで掛ける。髪と肌のテクスチャは明暗だけの灰色（不透明な所の明るさの中央値を髪0.8、肌0.9に揃える）、靴は白の単色。色の候補は`presets.json`の`hairColors`／`skinColors`
- 髪の半透明は、アルファをMath:Roundに通してglTFのalphaMode MASK（alphaCutoff 0.5）にする。three.jsではalphaTestで描かれる。両面を描く
- 靴を履いたら、体の`_shoe`が1の頂点を隠す（靴の中の足が突き抜けないように）。範囲は靴のmhcloの`delete_verts`
- 1ファイル3MB以内、テクスチャは1024px以下
