# API一覧

## 真上撮影の採寸（現在の方式）

`POST /v1/detections`のoptionsは`{ category: "auto" | "short_sleeve_top" | "long_sleeve_top" | "shirt" | "trousers", stage: "paper" | "garment" | "landmarks" | "cutout" | "all", paperCorners?: [number, number][], bbox?: [number, number, number, number], points?: LandmarkPoint[] }`。stage省略時はall。画像を遠近補正せず、A4の長辺を29.7cm、短辺を21cmとして縮尺を自動計算する。四隅・bbox・ランドマークはすべて送信画像の座標。

画面の1回の操作からpaper→garment→landmarks→cutoutを順に呼び、工程の切り替わりと経過時間から進捗の目安を1%刻みで表示する。推論内部の実測割合や残り時間の予測値ではなく、100%は全処理の完了後だけ表示する。返却値に`cutoutBase64`（透過PNGまたはnull）と`cutoutWidthPx`・`cutoutHeightPx`（null可）を追加する。

保存APIは追加のmultipartファイル`cutoutImage`（RGBAのPNG、8MiB以下）を受け取る。画像roleは`cutout`を追加し、クローゼットでは優先表示する。切り抜きは表示専用で、測定点を持たない。新規保存のmeasurementVersionは`df2-a4-flat-midpoint-v2`。従来の補正済みデータはそのまま読める。v2ではmeasurement画像にA4四隅も保存し、originalImageは不要。

採寸と服の登録を実装した。アバター・コーデは設計候補で、APIは未実装。

3D表示から使うデータの意味と実装箇所は[3D担当向けの引き継ぎ](3d-handoff.md)を参照。

> ログイン前の`/api/*`はURLを知っていれば誰でも利用できる。[ADR 0002](adr/0002-no-login-yet.md)を参照。

## 経路

ブラウザ→webの`/api/*`→apiの`/v1/*`→Supabase。採寸と、裏面の保存後のテクスチャ作成でだけapi→ローカルのPython推論サービスを呼ぶ。サーバー間通信には別々のBearerトークンを使う。`profile_id`は受け取らず、apiの`DEMO_PROFILE_ID`を使用する。

JSONはcamelCase、DBはsnake_case。エラーはHTTPステータスと`{ error: string }`で返し、内部例外・SQL・秘密の値は出さない。

## 実装済みの経路

| メソッド | apiのパス                  | 用途                                       |
| -------- | -------------------------- | ------------------------------------------ |
| GET      | `/health`                  | 死活確認。ここだけ認証不要                 |
| GET      | `/v1/inference-status`     | モデルファイルの配置・読み込み状況         |
| POST     | `/v1/detections`           | A4縮尺・服の検出・ランドマーク・切り抜き   |
| GET      | `/v1/measurements`         | カテゴリ別の点番号・式・採寸バージョン     |
| POST     | `/v1/measurements`         | 修正した点から寸法を再計算                 |
| GET      | `/v1/garments`             | 一覧。任意のcategoryで絞り込み、最新100件  |
| POST     | `/v1/garments`             | 写真・点・確定した寸法を登録               |
| GET      | `/v1/garments/:id`         | 詳細                                       |
| PATCH    | `/v1/garments/:id`         | 名前・寸法・購入時期・季節を変更           |
| PUT      | `/v1/garments/:id/back`    | 裏面の写真を登録・差し替え                 |
| POST     | `/v1/garments/:id/texture` | 保存済みの表裏写真からテクスチャ生成を依頼 |
| GET      | `/v1/garments/:id/texture` | テクスチャの状態。完成していれば画像のID   |
| DELETE   | `/v1/garments/:id`         | 写真と服を削除                             |

webは同じパス構成で中継する。例：`/api/garments`→`/v1/garments`。healthだけは`/api/health`→`/health`。

## 採寸

### POST /v1/detections

multipartの`image`はJPEG、最大8MiB・1200万画素・各辺4096px。ブラウザでは向きを確定して長辺1600px以下のJPEGに描き直し、EXIFを除去する。`options`は次のJSON文字列。

```ts
{
  category: "short_sleeve_top" | "long_sleeve_top" | "shirt" | "trousers" | "auto";
  paperCorners?: [number, number][];
  bbox?: [number, number, number, number];
  points?: { id: number; x: number; y: number; score: number | null }[];
  stage?: "paper" | "garment" | "landmarks" | "cutout" | "all";
}
```

四隅は送信画像上の外周順。長辺・短辺は画像上の長さから判断する。bboxは送信画像上の左上・右下で、手動指定する場合はカテゴリも必要。stage省略時は全工程を実行する。pointsは前の工程のランドマークで、cutout工程の手がかりにだけ使う。ズボンでは14点で囲んだ輪郭の外を背景として教え、脚の間や腰の外側の床を除く（[ADR 0024](adr/0024-trousers-cutout-with-landmarks.md)）。all工程では同じリクエストで求めた点を使う。

出力は`{ imageId, imageBase64, widthPx, heightPx, category, bbox, points, paperCorners, pixelsPerCm, modelVersion, warnings, elapsedMs, measurements, measurementVersion, cutoutBase64, cutoutWidthPx, cutoutHeightPx }`。

- 点とbboxは返されたJPEGの座標。`imageId`と画像サイズを必ずセットで扱う。
- `paperCorners`も同じJPEG上の座標。画像は遠近補正・再圧縮せず返す。
- paper/all工程では四隅未指定時にA4を検出し、縮尺を自動計算する。候補が見つからない場合や形状が不正な場合はpixelsPerCmがnullとなり、実寸を計算しない。
- 各工程のレスポンスはその工程の結果だけを持つ。画面側で同一写真の結果を統合し、最初のimageIdを保持する。
- cutoutBase64は服だけを囲む範囲に切り詰めたRGBAのPNG。測定用JPEGと寸法・原点が異なるため、測定点を重ねない。
- モデル未配置・推論失敗は警告を返す。ランダムな推定値で代用しない。

### GET・POST /v1/measurements

GETは`{ definitions, measurementVersion }`を返す。POSTの入力は`{ imageId, category, widthPx, heightPx, points, pixelsPerCm }`、出力は`{ imageId, measurements, measurementVersion }`。必要な点や縮尺がなければ対象寸法はnull。[採寸定義](measurement.md)を参照。

## 登録と取得

### スマホからの画像取得

`GET /v1/garments/:id/images/:imageId`はデモユーザーの服に所属する画像のみをJPEGまたはPNGのバイナリとして返す。webの`/api/garments/:id/images/:imageId`が同じ経路で中継する。画像IDはUUID。別の服の画像・存在しない画像は404。ブラウザからStorageへ直接接続せず、スマホからもwebのポートだけで保存画像を表示できる。既存のimages[].url（署名URL）は互換性のため残すが、画面表示にはこの中継経路を使う。

POSTはmultipartの`image`（測定用JPEG）、`cutoutImage`（任意の透過PNG）、`metadata`（JSON文字列）を受け取る。画面からの新規登録では切り抜き成功後に両画像を送る。`originalImage`も任意で受け取れるが、現在の画面では送らない。metadataは`{ name, category, imageId, widthPx, heightPx, points, pixelsPerCm, paperCorners, modelVersion, measurements, measurementVersion }`。画像の実サイズと座標系のサイズが一致するか確認する。手入力後のmeasurementsを最終値として保存し、再推定で上書きしない。成功は`201 { id }`。

一覧は`{ garments: Garment[] }`、詳細はGarmentを返す。共通の形は次のとおり。

```ts
type Garment = {
  id: string;
  name: string;
  category: "short_sleeve_top" | "long_sleeve_top" | "shirt" | "trousers";
  measurements: Measurements;
  measurementVersion: string;
  purchasedMonth: string | null; // "2026-04"のような年月
  seasons: ("spring" | "summer" | "autumn" | "winter")[];
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

画像URLは非公開Storageの10分間有効な署名URL。期限が切れたら一覧・詳細を再取得する。pointsとpaperCornersはそれぞれ所属する画像レコード内のピクセル座標。3D担当には主にcategory・measurements・measurementVersionを渡す。

PATCHの入力は`{ name?, measurements?, purchasedMonth?, seasons? }`、成功は`200 { id }`。寸法オブジェクトと季節の配列は全体を置き換える。purchasedMonthは`YYYY-MM`、nullで未設定に戻す。seasonsは春夏秋冬の重複しない0〜4件で、季節の順に並べて保存する。カテゴリ変更と保存後の点編集は初期版では非対応。DELETEは画像を先に消してから行を削除し、成功は204。途中失敗は503を返し、再試行できる。

### PUT /v1/garments/:id/back

裏面の写真を登録する。既にあれば差し替える。multipartの`image`（裏面のJPEG、必須）と`cutoutImage`（表示用の透過PNG、任意）を受け取り、roleは`back`と`back_cutout`。画像の条件は表の登録と同じ。cutoutImageを送らない場合、古いback_cutoutは消す。成功は`200 { id }`。

画像を新しいキーで上げてから、DBの関数`replace_garment_back`で古い裏面の行の削除と新しい行の追加を1つのトランザクションで行う。服の行をロックするので、同じ服への同時の差し替えは順番に処理される。DBで失敗したら上げた画像を消して503を返し、前の裏面はそのまま残る。古い画像のファイルは行を差し替えた後に消し、その削除に失敗しても成功として返す。

裏面は表示用で、ランドマーク・A4四隅・縮尺を持たない。画面ではA4→服の範囲とランドマーク（landmarks工程）→切り抜きの順に`POST /v1/detections`を呼び、ランドマークを切り抜きの手がかりに渡す。範囲が見つからなければJPEGだけを送る。クローゼットの一覧は表の画像（cutout→measurement→original）だけを表示し、裏面は詳細画面で表と並べる。[ADR 0020](adr/0020-back-photo-as-separate-role.md)を参照。

裏面を保存すると、apiは服のカテゴリと表のmeasurement画像・裏面を推論サービスの`POST /textures`へ送り、生成依頼の受付まで待つ。変換の完了は待たない。PUTの応答は`{ id, texture: { status: "accepted" } }`、依頼に失敗した場合は`{ id, texture: { status: "failed", message: "…" } }`。写真は保存済みなので、生成依頼だけが失敗してもPUTは200を返す。

### 保存済み写真からテクスチャを作る

`POST /v1/garments/:id/texture`（webは`POST /api/garments/:id/texture`）。リクエスト本文は不要。現在のプロフィールの服を照合し、保存済みの表のmeasurement画像と裏面のback画像を使う。カテゴリ・保存キー・画像URLはクライアントから受け取らない。

受付成功は202と`{ status: "accepted" }`。服がなければ404、表裏の写真が不足していれば400、待ちが満杯なら429、推論サービス・テンプレート・Storageを利用できなければ503。受付成功は生成完了を意味しない。完成・失敗は下の`GET /v1/garments/:id/texture`で確認する。apiはDBの服の登録日時`created_at`を内部の`POST /textures`の`garmentCreatedAt`として送る。作業フォルダと完成画像の確認用ファイル名は生成開始日時（JST）・カテゴリ・服IDの先頭8文字の順に並べる。`job.json`の`textureFile`に確認用ファイル名、`garmentCreatedAt`・`createdAt`・`completedAt`に各日時を記録する。

Tシャツ・長そで・ズボンでテンプレートが違い、長そでは受領したlongsleeve_male.glbのpitari UVを使う。ズボンは受領したGLBと一致するバージョン2を使う（[ADR 0026](adr/0026-trousers-template-from-delivered-uv.md)）。推論サービスは、生成物をPC内の`apps/inference/textures/{生成日時}_{種類}_{服ID先頭8文字}/`に書き出す。[ADR 0023](adr/0023-garment-texture-on-pc.md)、[ADR 0027](adr/0027-request-texture-from-saved-photos.md)を参照。

### テクスチャの状態を聞く

`GET /v1/garments/:id/texture`（webは`GET /api/garments/:id/texture`）。apiが推論サービスに状態を問い合わせ、完成していれば画像をStorageへ移して返す。

| 状態                                        | 応答                            |
| ------------------------------------------- | ------------------------------- |
| まだ作っていない（裏面が無い、作業が無い）  | `{ status: "none" }`            |
| 作成中（推論サービスで`queued`か`running`） | `{ status: "processing" }`      |
| 完成                                        | `{ status: "done", imageId }`   |
| 失敗                                        | `{ status: "failed", message }` |

画像は`GET /v1/garments/:id/images/:imageId`で取る（2048pxのPNG）。服の一覧と詳細の`images`には入れない。裏面を撮り直した後も、新しいテクスチャができるまで古い写真から作ったものが残るので、必ずこのAPIの`imageId`を使う。作成中の間は、画面が数秒おきに聞き直す。服が無ければ404。推論サービスにつながらないときは、保存済みのテクスチャがあれば`done`、無ければ503。`message`は決まった文で、推論サービスの理由はapiのログにだけ残す。

完成した作業は、`{プロフィールID}/{服ID}/texture-{UUID}.png`としてStorageに置き、`garment_images`の`texture_job`に作業フォルダ名を記録する。同じ作業は2回保存しない。新しい作業が完成したら、DBの関数`save_garment_texture`で行を1つのトランザクションで差し替え、古い画像を消す。裏面を撮り直す前に保存したテクスチャは使わない。[ADR 0033](adr/0033-serve-texture-through-api.md)を参照。

apiが使う推論サービスのAPI（どちらも`POST /textures`と同じBearerトークン）：

- `GET /textures/{garmentId}`：最新の作業の`{ status: "queued" | "running" | "done" | "failed", job: string | null, error: string | null }`。作業が無ければ404
- `GET /textures/{garmentId}/{job}/texture.png`：`done`の作業のテクスチャ

## 共通の型

- カテゴリはshort_sleeve_top・long_sleeve_top・shirt・trousersの4つ。長そでは33点を受け取り、Tシャツと同じ肩幅・袖丈・身幅・着丈を保存する。
- shirtは着せる3Dモデルを分けるためのカテゴリで、点・寸法の定義は長そでと同じ。apiは推論サービスへlong_sleeve_topとして送り、結果のカテゴリをshirtに戻して返す。テンプレートがないため、shirtのテクスチャ生成の依頼は400を返す（[ADR 0035](adr/0035-choose-garment-type-first.md)）。
- 点番号はカテゴリ内の1始まり。scoreはヒートマップ値、手動点はnull。アノテーションの可視性vとは別物。
- MeasurementsはshoulderWidthCm・sleeveLengthCm・bodyWidthCm・bodyLengthCm・waistCm・hipCm・thighWidthCm・riseCm・inseamCm・hemWidthCm。各値は正のcmまたはnull。
- 購入時期と季節は服の属性で、採寸には使わない。[ADR 0021](adr/0021-purchase-month-and-seasons.md)を参照。
- 新規登録のmeasurementVersionは`df2-a4-flat-midpoint-v2`。旧v1の取得・数値編集も可能。ウエストとヒップは幅の2倍。

## 後続の設計候補

`GET/PUT /v1/avatar`、`GET/POST /v1/outfits`、`DELETE /v1/outfits/:id`は未実装。[要件候補](requirements-candidates.md)で検討する。

### アバター設定の候補（ログインを入れるまで作らない）

アバターの設定は、ログインを入れるまでAPIを作らず、ブラウザのlocalStorageに保存する。ログインが無いうちにDBへ保存すると、全員が同じデモユーザーなので上書きし合い、身長や性別を誰でも読めてしまうため（[ADR 0035](adr/0035-avatar-settings-in-browser.md)）。

- ログインを入れたら、`GET/PUT /v1/avatar`で次の形を読み書きする。項目と値は`apps/web/src/lib/avatar-settings.ts`の`AvatarSettings`と同じ。
- `{ gender, heightCm, build, bodyFrame, skinColor, hairId, hairColor }`。まだ登録していなければ`GET`は`null`を返す。
- `heightCm`は150〜195。3Dモデルで身長を変えられる範囲（[ADR 0008](adr/0008-height-keys-and-tables.md)）。
- `build`は`slim`（細身）・`standard`（標準）・`broad`（がっしり）・`chubby`（ぽっちゃり）。体重は持たない（[ADR 0009](adr/0009-build-instead-of-weight.md)）。
- `bodyFrame`（骨格）は、`gender`が`female`のときだけ値を持ち、ほかは`null`。

## 参考文献

- [DeepFashion2](https://github.com/switchablenorms/DeepFashion2)：カテゴリ・点番号
- [HRNet公開実装](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch)：推論の入力と出力
