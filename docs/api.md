# API一覧

## 真上撮影の採寸（現在の方式）

`POST /v1/detections`のoptionsは`{ category: "auto" | "short_sleeve_top" | "long_sleeve_top" | "shirt" | "trousers", stage: "paper" | "garment" | "landmarks" | "cutout" | "all", paperCorners?: [number, number][], bbox?: [number, number, number, number], points?: LandmarkPoint[] }`。stageを省くとallになる。画像の遠近は補正せず、A4の長辺を29.7cm、短辺を21cmとして、縮尺を自動で計算する。四隅・bbox・ランドマークは、どれも送った画像の上の座標。

画面は1回の操作で、paper→garment→landmarks→cutoutの順に呼ぶ。進み具合の目安は、工程の切り替わりと経過時間から、1%刻みで出す。推論の中で測った割合や、残り時間の予測ではない。100%は、すべての処理が終わってから出す。返す値には、`cutoutBase64`（透過PNGかnull）と`cutoutWidthPx`・`cutoutHeightPx`（nullもある）を含める。

保存のAPIは、multipartのファイル`cutoutImage`（RGBAのPNG、8MiB以下）も受け取る。画像のroleには`cutout`があり、クローゼットではこれを先に出す。切り抜きは表示のためだけのもので、測った点を持たない。新しく保存する服のmeasurementVersionは`df2-a4-flat-midpoint-v2`。前の、遠近を補正したデータも、そのまま読める。v2ではmeasurement画像にA4の四隅も保存するので、originalImageは要らない。

採寸と服の登録はできている。アバターとコーデのAPIは、まだ候補で、作っていない。

3D表示で使うデータの意味と、それを書いた場所は、[3D担当向けの引き継ぎ](3d-handoff.md)を見る。

> ログインがまだ無いので、`/api/*`はURLを知っていれば誰でも使える。[ADR 0002](adr/0002-no-login-yet.md)を参照。

## 経路

ブラウザ→webの`/api/*`→apiの`/v1/*`→Supabase。apiがローカルのPythonの推論サービスを呼ぶのは、採寸と、裏面を保存したあとのテクスチャ作りのときだけ。サーバーどうしの通信には、それぞれ別のBearerトークンを使う。`profile_id`は受け取らず、apiの`DEMO_PROFILE_ID`を使う。

JSONはcamelCase、DBはsnake_case。エラーは、HTTPステータスと`{ error: string }`で返す。内部の例外・SQL・秘密の値は出さない。

## 実装済みの経路

| メソッド | apiのパス                  | 用途                                           |
| -------- | -------------------------- | ---------------------------------------------- |
| GET      | `/health`                  | 動いているかの確認。ここだけ認証が要らない     |
| GET      | `/v1/inference-status`     | モデルのファイルを置いたか、読み込んだか       |
| POST     | `/v1/detections`           | A4縮尺・服の検出・ランドマーク・切り抜き       |
| GET      | `/v1/measurements`         | 種類ごとの点番号・式・採寸のバージョン         |
| POST     | `/v1/measurements`         | 直した点から、寸法を計算し直す                 |
| GET      | `/v1/garments`             | 一覧。categoryで絞り込める。新しい100件        |
| POST     | `/v1/garments`             | 写真・点・確定した寸法を登録                   |
| GET      | `/v1/garments/:id`         | 詳細                                           |
| PATCH    | `/v1/garments/:id`         | 名前・寸法・購入時期・季節・素材を変える       |
| PUT      | `/v1/garments/:id/back`    | 裏面の写真を登録・差し替え                     |
| POST     | `/v1/garments/:id/texture` | 保存した表と裏の写真からテクスチャの生成を依頼 |
| GET      | `/v1/garments/:id/texture` | テクスチャの状態。完成していれば画像のID       |
| DELETE   | `/v1/garments/:id`         | 写真と服を消す                                 |
| GET      | `/v1/materials`            | 服の素材の一覧                                 |

webは同じパス構成で中継する。例：`/api/garments`→`/v1/garments`。healthだけは`/api/health`→`/health`。

## 採寸

### POST /v1/detections

multipartの`image`はJPEGで、最大8MiB・1200万画素で、各辺は4096px以下。ブラウザで向きを決め、長辺1600px以下のJPEGに描き直して、EXIFを消してから送る。`options`は次のJSON文字列。

```ts
{
  category: "short_sleeve_top" | "long_sleeve_top" | "shirt" | "trousers" | "auto";
  paperCorners?: [number, number][];
  bbox?: [number, number, number, number];
  points?: { id: number; x: number; y: number; score: number | null }[];
  stage?: "paper" | "garment" | "landmarks" | "cutout" | "all";
}
```

四隅は、送った画像の上で、外周の順に並べる。どれが長辺・短辺かは、画像の上の長さで決める。bboxは、送った画像の上の左上と右下で、手で指定するときはカテゴリも要る。stageを省くと、すべての工程を実行する。pointsは前の工程のランドマークで、cutoutの工程の手がかりにだけ使う。ズボンでは、14点で囲んだ輪郭の外を背景として教え、脚の間や腰の外側の床を除く（[ADR 0024](adr/0024-trousers-cutout-with-landmarks.md)）。allの工程では、同じリクエストで求めた点を使う。

出力は`{ imageId, imageBase64, widthPx, heightPx, category, bbox, points, paperCorners, pixelsPerCm, modelVersion, warnings, elapsedMs, measurements, measurementVersion, cutoutBase64, cutoutWidthPx, cutoutHeightPx }`。

- 点とbboxは、返したJPEGの上の座標。`imageId`と画像の大きさは、いつも組にして扱う。
- `paperCorners`も、同じJPEGの上の座標。画像は、遠近の補正も圧縮のし直しもせずに返す。
- paperとallの工程では、四隅を指定しなければA4を見つけ、縮尺を自動で計算する。候補が見つからないときや、形がおかしいときは、pixelsPerCmがnullになり、実寸を計算しない。
- 各工程の応答は、その工程の結果だけを持つ。画面が同じ写真の結果をまとめ、最初のimageIdを持ち続ける。
- cutoutBase64は、服だけを囲む範囲に切り詰めたRGBAのPNG。測定用のJPEGとは大きさも原点も違うので、測った点を重ねない。
- モデルを置いていないときと、推論が失敗したときは、警告を返す。ランダムな推定値で代用しない。

### GET・POST /v1/measurements

GETは`{ definitions, measurementVersion }`を返す。POSTの入力は`{ imageId, category, widthPx, heightPx, points, pixelsPerCm }`、出力は`{ imageId, measurements, measurementVersion }`。要る点や縮尺が無ければ、その寸法はnull。[採寸の定義](measurement.md)を見る。

## 登録と取得

### スマホからの画像取得

`GET /v1/garments/:id/images/:imageId`は、デモユーザーの服の画像だけを、JPEGかPNGのバイナリで返す。webの`/api/garments/:id/images/:imageId`が、同じ経路で中継する。画像IDはUUID。別の服の画像や、無い画像は404。ブラウザはStorageへ直接つながないので、スマホからもwebのポートだけで、保存した画像を出せる。前からあるimages[].url（署名URL）は互換のために残すが、画面に出すときは、この中継の経路を使う。

### POST /v1/garments

multipartの`image`（測定用のJPEG）、`cutoutImage`（透過PNG、無くてもよい）、`metadata`（JSON文字列）を受け取る。画面から新しく登録するときは、切り抜きができれば両方の画像を送る。推論サービスにつながらないときや切り抜けなかったときは、測定用のJPEGだけを送る。推論にまったくつながらなかったときは、pointsとpaperCornersを空、pixelsPerCmとmodelVersionをnullにし、寸法は手で入れた値だけを送る（推定値は作らない）。`originalImage`も受け取れるが、今の画面では送らない。metadataは`{ name, category, imageId, widthPx, heightPx, points, pixelsPerCm, paperCorners, bbox?, modelVersion, measurements, measurementVersion, materials?, colorFamily? }`。bboxは採寸画面で確かめた服の範囲`[x1, y1, x2, y2]`で、省くとnullで保存する。写真の端をはみ出した範囲は写真の中に切り詰め、写真の外にあれば保存しない（[ADR 0052](adr/0052-saved-bbox-for-texture.md)）。materialsは下の「素材」の形で、省くと綿100%で保存する。colorFamilyは下の「色の系統」の値で、省くとnullで保存する。apiは、画像の実際のサイズと、座標系の画像サイズが一致するかを確かめる。手で直したあとのmeasurementsを最終の値として保存し、推定し直して上書きしない。成功は`201 { id }`。

### GET /v1/garments、GET /v1/garments/:id

一覧は`{ garments: Garment[] }`を、詳細はGarmentを返す。共通の形は次のとおり。

```ts
type Garment = {
  id: string;
  name: string;
  category: "short_sleeve_top" | "long_sleeve_top" | "shirt" | "trousers";
  measurements: Measurements;
  measurementVersion: string;
  purchasedMonth: string | null; // "2026-04"のような年月
  seasons: ("spring" | "summer" | "autumn" | "winter")[];
  materials: { materialId: string; label: string; percent: number }[]; // 割合の多い順
  colorFamily: ColorFamily | null; // 前からある服と、色を決められなかった服はnull
  createdAt: string;
  images: {
    id: string;
    role: "original" | "measurement" | "cutout" | "back" | "back_cutout";
    url: string;
    widthPx: number;
    heightPx: number;
    points: { id: number; x: number; y: number; score: number | null }[];
    pixelsPerCm: number | null;
    paperCorners: [number, number][];
    modelVersion: string | null;
  }[];
};
```

画像のURLは、非公開のStorageにある画像の署名URLで、有効期間は10分間。期限が切れたら、一覧か詳細を取り直す。pointsとpaperCornersは、それぞれの画像の中のピクセル座標。3D担当には主にcategory・measurements・measurementVersionを渡す。

### PATCH・DELETE /v1/garments/:id

PATCHの入力は`{ name?, measurements?, purchasedMonth?, seasons?, materials?, colorFamily? }`で、成功は`200 { id }`。寸法・季節・素材は、送ったもので丸ごと置き換える。purchasedMonthは`YYYY-MM`。purchasedMonthとcolorFamilyは、nullを送ると未設定に戻る。seasonsは、春夏秋冬から重ならない0〜4件で、季節の順に並べて保存する。種類の変更と、保存したあとの点の編集は、最初の版ではできない。

DELETEは、画像を先に消してから行を消す。成功は204。途中で失敗したら503を返し、やり直せる。

### 素材

服は素材を混率で持つ（例：綿98%・ポリウレタン2%）。`GET /v1/materials`は`{ materials: { id: string; label: string }[] }`を、画面に並べる順で返す。素材は綿（`cotton`）・ポリエステル・ウール・麻・ナイロン・レーヨン・アクリル・ポリウレタン・シルク・カシミヤ・その他（`other`）。

登録とPATCHの`materials`は`{ materialId: string; percent: number }[]`。1〜10件で、素材は重ならず、percentは1〜100の整数で、合計は100。一覧に無い素材は400。PATCHは服の素材をまとめて差し替え、DBの関数`set_garment_materials`で1つのトランザクションにする。素材とほかの項目を一緒に送ったときは、素材を先に保存する。なので、素材の誤りで400になったときは、ほかの項目も変わらない。Garmentの`materials`は割合の多い順で、同じ割合なら一覧の順。素材を入れずに登録した服と、素材を足す前に登録した服は、綿100%になる。

### 色の系統

服は色の系統を1つ持つ。値は`white`（白）・`black`（黒）・`gray`（グレー）・`navy`（紺）・`beige`（ベージュ）・`brown`（茶）・`red`（赤）・`pink`（ピンク）・`orange`（オレンジ）・`yellow`（黄）・`green`（緑）・`blue`（青）・`purple`（紫）。webが切り抜きの色から決めて登録で送り、違えばPATCHで直す。一覧に無い値は400。分け方は[ADR 0044](adr/0044-color-family-from-cutout.md)。

### PUT /v1/garments/:id/back

裏面の写真を登録する。もうあれば差し替える。multipartの`image`（裏面のJPEG、必須）と`cutoutImage`（表示用の透過PNG、任意）を受け取り、roleは`back`と`back_cutout`。画像の条件は表の登録と同じ。cutoutImageを送らないときは、古いback_cutoutを消す。成功は`200 { id }`。

画像を新しいキーで上げてから、DBの関数`replace_garment_back`で古い裏面の行の削除と新しい行の追加を1つのトランザクションで行う。服の行をロックするので、同じ服への同時の差し替えは順番に処理される。DBで失敗したら上げた画像を消して503を返し、前の裏面はそのまま残る。古い画像のファイルは行を差し替えた後に消し、その削除に失敗しても成功として返す。

裏面は表示用で、ランドマーク・A4四隅・縮尺を持たない。画面ではA4→服の範囲とランドマーク（landmarks工程）→切り抜きの順に`POST /v1/detections`を呼び、ランドマークを切り抜きの手がかりに渡す。範囲が見つからないとき、推論の通信に失敗したとき、範囲は見つかったが切り抜けなかったときは、JPEGだけを送る。クローゼットの一覧は表の画像（cutout→measurement→original）だけを表示し、裏面は詳細画面で表と並べる。[ADR 0020](adr/0020-back-photo-as-separate-role.md)を参照。

裏面を保存すると、apiは服のカテゴリと表のmeasurement画像・裏面を推論サービスの`POST /textures`へ送り、生成依頼の受付まで待つ。変換の完了は待たない。PUTの応答は`{ id, texture: { status: "accepted" } }`、依頼に失敗したときは`{ id, texture: { status: "failed", message: "…" } }`。写真は保存してあるので、テクスチャの依頼だけが失敗しても、PUTは200を返す。

### 保存済み写真からテクスチャを作る

`POST /v1/garments/:id/texture`（webは`POST /api/garments/:id/texture`）。リクエストの本文は要らない。今のプロフィールの服かを確かめ、保存した表のmeasurement画像と、裏面のback画像を使う。カテゴリ・保存のキー・画像のURLは、クライアントから受け取らない。

受け付けたら、202と`{ status: "accepted" }`を返す。服が無ければ404、表と裏の写真がそろっていなければ400、待ちがいっぱいなら429、推論サービス・テンプレート・Storageを使えなければ503。受け付けても、できあがったとは限らない。できたか失敗したかは、下の`GET /v1/garments/:id/texture`で確かめる。apiはDBの服の登録日時`created_at`を内部の`POST /textures`の`garmentCreatedAt`として、裏面の画像のIDを`backImageId`として送る。`backImageId`は、状態を聞くときに、撮り直す前の写真から作った作業を見分けるために使う。作業フォルダと、できた画像の確認用のファイル名は、作り始めた日時（JST）・種類・服IDの先頭8文字の順に並べる。`job.json`には、`textureFile`に確認用のファイル名を、`garmentCreatedAt`・`createdAt`・`completedAt`にそれぞれの日時を書く。

Tシャツ・長そで・シャツ・ズボンでテンプレートが違い、長そでは、受け取ったlongsleeve_male.glbのpitari UVを使う。シャツは前後からまっすぐ投影したshirt_male.glbのpitari UVを使い、写真の点は長そでとして推定する（[ADR 0038](adr/0038-shirt-texture-from-projected-uv.md)）。ズボンは、受け取ったGLBと合うバージョン2を使う（[ADR 0026](adr/0026-trousers-template-from-delivered-uv.md)）。推論サービスは、生成物をPC内の`apps/inference/textures/{生成日時}_{種類}_{服ID先頭8文字}/`に書き出す。[ADR 0023](adr/0023-garment-texture-on-pc.md)、[ADR 0027](adr/0027-request-texture-from-saved-photos.md)を参照。

### テクスチャの状態を聞く

`GET /v1/garments/:id/texture`（webは`GET /api/garments/:id/texture`）。apiが推論サービスに状態を問い合わせ、完成していれば画像をStorageへ移して返す。

| 状態                                        | 応答                                      |
| ------------------------------------------- | ----------------------------------------- |
| まだ作っていない（裏面が無い、作業が無い）  | `{ status: "none" }`                      |
| 作成中（推論サービスで`queued`か`running`） | `{ status: "processing", imageId? }`      |
| 完成                                        | `{ status: "done", imageId }`             |
| 失敗                                        | `{ status: "failed", message, imageId? }` |

画像は`GET /v1/garments/:id/images/:imageId`で取る（2048pxのPNG）。服の一覧と詳細の`images`には入れない。裏面を撮り直した後も、新しいテクスチャができるまで古い写真から作ったものが残るので、必ずこのAPIの`imageId`を使う。`processing`と`failed`の`imageId`は、作り直す前に今の写真から作ったテクスチャで、無ければ省く。画面は`imageId`があれば貼り、`processing`の間は数秒おきに聞き直す。服が無ければ404。推論サービスにつながらないときは、保存済みのテクスチャがあれば`done`、無ければ503。`message`は決まった文で、推論サービスの理由はapiのログにだけ残す。

完成した作業は、`{プロフィールID}/{服ID}/texture-{UUID}.png`としてStorageに置き、`garment_images`の`texture_job`に作業フォルダ名を記録する。同じ作業は2回保存しない。新しい作業が完成したら、DBの関数`save_garment_texture`で行を1つのトランザクションで差し替え、古い画像を消す。関数は服の行をロックしたまま裏面が変わっていないかを確かめ直し、変わっていれば保存せずに`processing`を返す。裏面を撮り直す前に保存したテクスチャは使わない。推論サービスが返す`backImageId`が今の裏面と違う作業も、無い扱いにする。[ADR 0033](adr/0033-serve-texture-through-api.md)を参照。

apiが使う推論サービスのAPI（どちらも`POST /textures`と同じBearerトークン）：

- `POST /textures`：フォームの`backImageId`を作業に記録する。表のmeasurement画像に点・A4の四隅・服の範囲のどれかが保存してあれば、`frontSaved`に`{ widthPx, heightPx, points, paperCorners, bbox }`のJSONを入れる。推論サービスは、写真と大きさが同じなら、その点・四隅・範囲を推論の結果より優先して使う（[ADR 0051](adr/0051-saved-points-for-texture.md)、[ADR 0052](adr/0052-saved-bbox-for-texture.md)）
- `GET /textures/{garmentId}`：最新の作業の`{ status: "queued" | "running" | "done" | "failed", job: string | null, error: string | null, backImageId: string | null }`。作業が無ければ404。`backImageId`を返さない推論サービスでは、最新の作業を今の写真のものとみなす
- `GET /textures/{garmentId}/{job}/texture.png`：`done`の作業のテクスチャ

## 今日の天気（webだけ）

`GET /api/weather`はapiを通さず、webのサーバーがOpen-Meteoから今日の気温を取って返す。DBに触れない（[ADR 0040](adr/0040-today-weather-and-season.md)）。

- 入力：任意の`lat`・`lon`。0.1度に丸めて使い、保存しない。無いか、空か、範囲の外なら東京駅にする。クエリはホスティングのアクセスログに残るので、画面は`@/lib/weather`の`roundCoordinate`で丸めてから送る。
- 出力：`{ season, temperatures, place }`。`season`は服の`seasons`と同じ`spring`・`summer`・`autumn`・`winter`。`temperatures`は`{ morning, noon, night }`（7時・13時・19時の℃の整数、欠けたらnull）。`place`は`current`か`fallback`。
- Open-Meteoにつながらないときも200で返し、`temperatures`はnull、季節は月だけで決める。この答えはブラウザに残さない（`no-store`）。
- 同じ丸めた位置へのOpen-Meteoの問い合わせは、サーバーで10分まとめる。

## 共通の型

- カテゴリはshort_sleeve_top・long_sleeve_top・shirt・trousersの4つ。長そでは33点を受け取り、Tシャツと同じ肩幅・袖丈・身幅・着丈を保存する。
- shirtは着せる3Dモデルを分けるためのカテゴリで、点・寸法の定義は長そでと同じ。apiは推論サービスへlong_sleeve_topとして送り、結果のカテゴリをshirtに戻して返す。テクスチャはシャツのUVテンプレートで作る（[ADR 0035](adr/0035-choose-garment-type-first.md)、[ADR 0038](adr/0038-shirt-texture-from-projected-uv.md)）。
- 点番号は、種類ごとに1から数える。scoreはヒートマップの値で、手で置いた点はnull。アノテーションの見え方を表すvとは別のもの。
- MeasurementsはshoulderWidthCm・sleeveLengthCm・bodyWidthCm・bodyLengthCm・waistCm・hipCm・thighWidthCm・riseCm・inseamCm・hemWidthCm。それぞれの値は、正のcmかnull。
- 購入時期と季節は服の属性で、採寸には使わない。[ADR 0021](adr/0021-purchase-month-and-seasons.md)を参照。
- 新しく登録する服のmeasurementVersionは`df2-a4-flat-midpoint-v2`。前のv1も、取得と数値の編集ができる。ウエストとヒップは、幅の2倍。

## 後続の設計候補

`GET/PUT /v1/avatar`、`GET/POST /v1/outfits`、`DELETE /v1/outfits/:id`は、まだ作っていない。[要件候補](requirements-candidates.md)で考える。

### アバター設定の候補（ログインを入れるまで作らない）

アバターの設定は、ログインを入れるまでAPIを作らず、ブラウザのlocalStorageに保存する。ログインが無いうちにDBへ保存すると、全員が同じデモユーザーなので上書きし合い、身長や性別を誰でも読めてしまうため（[ADR 0036](adr/0036-avatar-settings-in-browser.md)）。

- ログインを入れたら、`GET/PUT /v1/avatar`で次の形を読み書きする。項目と値は`apps/web/src/lib/avatar-settings.ts`の`AvatarSettings`と同じ。
- `{ gender, heightCm, build, bodyFrame, skinColor, hairId, hairColor }`。まだ登録していなければ`GET`は`null`を返す。
- `heightCm`は150〜195。3Dモデルで身長を変えられる範囲（[ADR 0008](adr/0008-height-keys-and-tables.md)）。
- `build`は`slim`（細身）・`standard`（標準）・`broad`（がっしり）・`chubby`（ぽっちゃり）。体重は持たない（[ADR 0009](adr/0009-build-instead-of-weight.md)）。
- `bodyFrame`（骨格）は、`gender`が`female`のときだけ値を持ち、ほかは`null`。

## 参考文献

- [DeepFashion2](https://github.com/switchablenorms/DeepFashion2)：カテゴリ・点番号
- [HRNet公開実装](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch)：推論の入力と出力
