# assets/blenderのルール

Blender 4.2＋MPFB2 2.0.17で、男性アバターとTシャツのglbを作るスクリプト。身長・体型と実寸（cm）に合わせてTシャツを変形させる。

## ファイル

- `build_tshirt.py`：入口。アバターとTシャツを作り、`apps/web/public/models/`に書き出す
- `verify_sizes.py`：サイズ合わせの検証と、確認用の画像（`out/renders/`）
- `pitari_tshirt.py`：共通処理（生成・基準点・計測・シェイプキー・書き出し）
- `build_presets.py`：入口。髪4種と靴を作り、`apps/web/public/presets/`に書き出す
- `build_longsleeve.py`：入口。Tシャツの袖を手首まで伸ばした長袖を作り、`apps/web/public/models/`に書き出す（[ADR 0018](../../docs/adr/0018-longsleeve-from-tshirt.md)）
- `pitari_longsleeve.py`：長袖の共通処理（袖口の先に腕に沿って輪を足す）
- `build_shirt.py`：入口。長袖のシャツ（`male_casualsuit03`のシャツ）を作り、`apps/web/public/models/`に書き出す（[ADR 0019](../../docs/adr/0019-shirt-from-casualsuit03.md)）
- `pitari_shirt.py`：シャツの共通処理（シャツの取り出し・基準点・前の開け閉め）
- `render_presets.py`：プリセットの確認。書き出したglbを重ねて、サムネイル（`apps/web/public/presets/thumbs/`）と体型ごとの確認画像（`out/presets/builds_check.png`）を描き、めり込みを数える
- `pitari_presets.py`：プリセットの共通処理（素材の選択・灰色のテクスチャ・材質）。`build_tshirt.py`も体の肌と`_shoe`に使う
- `out/`：生成物（`tshirt_landmarks.json`、確認用の`build.blend`、`renders/`）。gitに入れない
- `data/tshirt_pitari_uv.json`：テクスチャ担当が作ったTシャツのUV（`pitari`、写真から貼る用）。面の角ごとのUVと、面の並びのハッシュ

## 再生成と検証（リポジトリのルートで）

```
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/build_tshirt.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background assets/blender/out/build.blend --python assets/blender/verify_sizes.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/build_presets.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/render_presets.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/build_longsleeve.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background assets/blender/out/build_longsleeve.blend --python assets/blender/verify_sizes.py -- longsleeve
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background --python assets/blender/build_shirt.py
"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe" --background assets/blender/out/build_shirt.blend --python assets/blender/verify_sizes.py -- shirt
```

- プリセットの生成は約20秒、確認は約3分。確認は`build_tshirt.py`の体（`avatar_male.glb`）を読むので、体を作り直したら確認もやり直す

- 生成は約30〜50秒、検証は約40秒（画像の書き出しを含む）
- 検証は標準体型±0.5cm、ほかの体型±1cmで合否を出し、不合格なら終了コード1。身長は標準と150〜195cmの8点で確かめる
- 生成スクリプトは、途中でPythonのエラーが出てもBlenderが終了コード0を返す。ログの`[pitari] 完了`で終わったかを見る
- MPFB2はBlenderの拡張機能として有効にしておく（Pythonからは`bl_ext.blender_org.mpfb`でimport）
- 衣服のアセットのパスは`pitari_tshirt.py`の`MHCLO`に直書きしてある（`C:\MakeHuman\data\clothes\male_casualsuit06\male_casualsuit06.mhclo`）。別のPCで動かすなら直す

## 出力（apps/web/public/models/）

| ファイル                                        | 中身                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `avatar_male.glb`                               | 体。体型キー3個＋身長キー2個＋頂点属性`_cover`（服の下の重み0〜1。1は服で完全に覆われる所）と`_shoe_<靴のid>`（その靴で隠れる所が1。靴ごとに範囲が違う）。親指を内側に曲げるキー`thumb_in`。肌は明暗だけの灰色のテクスチャ（ブラウザで肌の色を掛ける） |
| `tshirt_male.glb`                               | Tシャツ。体型キー3個＋身長キー2個＋サイズキー4個                                                                                                                                                                                                       |
| `tshirt_male_height.json`                       | 標準の身長（`standard_cm`）と、体型・身長（150、160、標準、185、195cm）ごとの基準寸法、キーの効き方`m`（4項目×4キー）、体の身幅`body_width`。webはこれを使う                                                                                           |
| `tshirt_male_base.json`                         | 標準の身長での体型ごとの基準寸法（cm）。webは使っていない                                                                                                                                                                                              |
| `tshirt_male_correction.json`                   | 標準の身長での体型ごとのキーの効き方`m`。webは使っていない                                                                                                                                                                                             |
| `longsleeve_male.glb`、`longsleeve_male_*.json` | 長袖。中身はTシャツの同じ名前のファイルと同じ形（体型キー3個＋身長キー2個＋サイズキー4個、身長ごとの表）                                                                                                                                               |
| `shirt_male.glb`、`shirt_male_*.json`           | 長袖のシャツ。長袖と同じキーに、前の開け閉めのキー`shirt_close`／`shirt_open`を足したもの                                                                                                                                                              |

生成物だが、Vercelでは再生成できないのでcommitする。

## 決まりごと

- キー名・単位・寸法の定義を変えるときは、先にユーザーに相談する
- Blenderの単位はメートル。計測結果だけcm
- サイズキーは`size_length`／`size_width`／`size_shoulder`／`size_sleeve`。値1.0＝+1cm
  - +10cmの形を作り、値0.1でNew Shape from Mixして1cmキーにする
  - 身幅を大きくした見た目はキー`width_folds`（`build_tshirt.make_fold_key`）。+10cmで、均等に広げた形（`size_width`×10）を、前は体に近いまま脇・背中を縦のしわにし、脇の下から裾へ広げる量を増やした（裾で2倍。胸だけがふくらまず、胸から下へまっすぐ落ちて裾で広がる）形。しわは間隔・強さ・高さによるずれの違う4つの波を重ね、位置は固定の種の乱数で決める（同じ間隔の波だと規則的に見える）（`pitari_tshirt.width_fold_displacement`）に置き換える差。値1で+10cm分。ブラウザは身幅が基準より大きいときだけ`size_width`÷10を入れる。しわの波は一周の長さを余計に増やしてキーの値に比例しない（マイナスでも長さが増える）ので、サイズキーと検証には使わない。均等に広げただけだと風船のようにふくらみ、布の物理演算で垂らしても横の広がりは残った
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
- アバター画面は`/avatar`（`src/app/avatar/`）。開発用の確認ページは`/dev/tryon`（`src/app/dev/tryon/`、実寸の直接入力・キーの値・計算時間を出す）。本番では404で、`next dev`のときだけ開く。スマホではPCの`next dev`にLANでつなぐ（`docs/setup.md`の「スマホで撮影する」）。どちらも状態と計算は`src/components/try-on/use-try-on.ts`、3D表示は`src/components/try-on/try-on-scene.tsx`

## UV（写真から貼る用、`pitari`）

- TシャツのUVはテクスチャ担当が作った（`pitari_uv_work.blend`の`pitari`）。`pitari_tshirt.apply_pitari_uv`が面の順番どおりに写し、元の`UVMap`は消す（glTFの`TEXCOORD_0`が`pitari`になる）。面の並びのハッシュが違えば止める
- 長袖は、Tシャツの部分に同じUVを写し、前腕は`pitari_longsleeve.extend_pitari_uv`が袖の島を袖の向きに延ばして作る（仮。テクスチャ担当に確かめてもらう）。左右の島の袖がぶつかるので、前身頃を上半分、後身頃を下半分に、同じ縮尺（1.161147）で並べ直す
  - テクスチャ担当のUVは袖の前後の切れ目が階段状なので、袖口の島が短く入れ替わる所はそろえ、袖の向きに飛び出した袖口の位置は隣の列に合わせてから延ばす
- シャツのUVは、テクスチャ担当のものが無いので`pitari_shirt.make_pitari_uv`が作る（仮。テクスチャ担当に確かめてもらう）。面の向き（法線のy）で前と後ろに分け、前は正面から、後ろは背面から（着用者の左が画像の左）まっすぐ投影し、長袖と同じく前を上半分、後ろを下半分に並べる
- ジーンズのUVは、まだMakeHumanの元の`UVMap`のまま（テクスチャ担当に頼んでいる）

## シャツ（`pitari_shirt.py`）

- `male_casualsuit03`の先頭1613頂点がシャツ（後ろはジーンズなので消す）。色は無地（元のストライプのテクスチャは使わない）
- 前は元から左右に分かれていて、裾・左右の前の縁・襟の外側が1本の縁の輪になっている。左右の前身頃は中心で重なっているので、xの正負ではなくUVの島で分ける
- 基準点はTシャツと同じ形（`measure`・サイズキーがそのまま使える）にして、UVの島（後身頃・左右の前身頃・袖・襟）と縁の輪から求める
  - 袖口は手首で内側へ折り返され、裏地が前腕の途中まで戻ってそこで縁の輪になっている。袖口は、袖の向きで一番先にある、その輪と同じ数の頂点（手首の折り返し）にする
  - 袖は付け根から袖口まで12の区間に分け、区間の中心を結んで腕の中心線にする（長袖の袖丈キー・垂れ方のキー・`_sleeve`がそのまま使える）
- 前の開け閉めはキー2つ。両方0の元の形が「少し開ける」（襟元のV字）
  - `shirt_close`（閉める）：前を襟元まで閉じる。前身頃は、V字の部分で左右の前の縁を、V字の一番下での位置（左右が元から重なっている所）へ寄せる。V字の始まりは、左右の重なり（右の縁のx−左の縁のx）が下より減り始める高さ（縁の距離で見ると、交差する所で開き始めを見逃す）。襟の前側は首の縦の軸の周りに回して、襟の先を前の中心で合わせる（横に押すと潰れる）
  - `shirt_open`（開ける）：左右の前身頃と襟の前側を、体の中心の縦の軸の周りに回して横へ開く（前の縁で0.45rad、脇で0）。上から下まで同じだけ開く。体に入る所はブラウザの押し出しで出る

## 長袖（`pitari_longsleeve.py`）

- Tシャツ（`add_shirt`）の袖口から手首まで、腕に沿って輪を14個足す。Tシャツの頂点は番号を変えないので、基準点・寸法の測り方・サイズキーはTシャツのものをそのまま使う。袖丈は肩先から手首の袖口まで
- Tシャツの袖口は内側へ折り返してあるので、縁を外側の面の延長へ1cm開いてから伸ばす（段ができないように）
- 輪の半径は腕の断面と円の中間にして、輪の並びの向きにならす（ひじの凹凸を写さない）。ゆとりは袖口の値から手首の1.2cmへ移す
- 手首は標準体型で腕の一番細い所を探し、その近くの体の頂点を覚えておく。ほかの体型・身長では、その頂点の平均を手首にする（ぽっちゃりでは一番細い所が手の先になるため）
- 体型・身長の形は、その体の腕に沿って同じ数の輪を足して作る
- 身幅・肩幅のキー（と`width_folds`）では、袖が付け根と一緒に動く量を、腕に沿った位置0.45までに0へ下げる（`pitari_longsleeve._taper_sleeves`。袖を平行移動させると袖口が手首から外れて手が出る）
- 袖丈キーだけは長袖用（`pitari_longsleeve.sleeve_displacement`）。袖の頂点を前腕の向きに、腕の中心線に沿った位置の割合（縫い目0→袖口1）で動かす。Tシャツと同じ縫い目→袖口の直線の向きだと、ひじで曲がった腕から袖口が外れる。頂点ごとに中心線の向きへ動かすと、キーの値と袖丈の関係が直線から外れて検証に通らない
- 頂点属性`_sleeve`に、腕に沿った位置（縫い目0→袖口1、胴は0）を入れる。ブラウザの`src/lib/sleeve-drape.ts`は、これで袖の中心線を作り、袖の中の腕・手を選ぶ
- 袖丈が腕より長いときの垂れ方は、布のシミュレーションで作ったキー`drape_3`／`drape_6`／`drape_10`（余りが3・6・10cmのとき。値1で、袖丈キーだけの形から垂れた形への差）。標準体型・標準の身長で、手首から肩側へ8cmより先の袖だけを布として動かし、体に当てて60フレーム垂らす。ブラウザは余った長さで隣の2つを直線で混ぜる（10cmより長ければ`drape_10`のまま）
- ブラウザの体の`_cover`はTシャツのもので、前腕・ひじ・手を含まない。長袖では`sleeve-drape.ts`の`bodyInSleeves`が袖の中の腕・手を選び、押し出しで頂点の間から出ていないかを確かめる
  - それでも輪の間からひじが出るので、袖の中に隠れる腕（腕に沿った位置0.85まで）は描かない（体の`_hide`。靴の中の足と同じ）。袖口の奥は消さない（のぞいたときに穴に見えないように）
- 袖が手にかぶさるときは、体のキー`thumb_in`（`pitari_tshirt.thumb_in_shape`）で親指を内側へ40°ほど曲げて袖の中に収める。ブラウザは垂れ方のキーの合計（0〜1）を入れる。親指を描かない方法は、付け根に穴が開いたのでやめた

## プリセット（髪・靴、`apps/web/public/presets/`）

- 素材はMakeHuman system assetsのCC0のものだけ。使った素材は`apps/web/public/presets/LICENSES.md`に記録する。選んだ素材は`pitari_presets.HAIR`／`SHOES`
- 髪・靴は体と同じ原点・スケールで、体と同じ体型キー3個＋身長キー2個を持つ（骨格は使わない。[ADR 0017](../../docs/adr/0017-presets-follow-body-with-shape-keys.md)）。ブラウザで体と同じ値を入れれば重なる
- 色はブラウザで掛ける。髪のテクスチャは明暗だけの灰色（不透明な所の明るさの中央値を0.8に揃える）。肌は灰色にせず、色ごとに中央値で割って0.9倍にする（唇・ほおの赤みを残す。灰色にすると顔色が悪く見えた）。靴は`pitari_presets.SHOE_STYLE`で靴ごとに決める（白のスニーカーは白一色にして元の明るさを陰影として少し残す、黒の革靴は元の色のまま）。靴下は靴ごとにテクスチャの靴下の四角に当たる面を別の材質`socks`にし、灰色にして明るさの中央値を0.85に揃える（ブラウザで靴下の色を掛ける）。色の候補は`presets.json`の`hairColors`／`skinColors`／`sockColors`
- 顔のパーツ（目・眉毛・まつ毛、`pitari_presets.FACE`）は`presets/face/face.glb`に1つにまとめ、いつも着ける。体型キー・身長キーは髪と同じ
  - 目はMakeHumanの茶色の目の色みを0.45に抜いた（そのままだと赤い目に見える）
  - 眉毛・まつ毛は髪と同じく灰色にして髪の色を掛ける（材質名が`hair_`で始まるものだけ、ブラウザで色を掛ける）。テクスチャが薄いので、アルファを3倍にしてから0.5で切る
- 髪の半透明は、アルファをMath:Roundに通してglTFのalphaMode MASK（alphaCutoff 0.5）にする。three.jsではalphaTestで描かれる。両面を描く
- 靴を履いたら、体の`_shoe_<靴のid>`が1の頂点を隠す（靴の中の足が突き抜けないように）。範囲は靴のmhcloの`delete_verts`
- 1ファイル3MB以内、テクスチャは1024px以下
