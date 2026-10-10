# API一覧

## 真上撮影の採寸（現在の方式）

`POST /v1/detections`のoptionsは`{ category: "auto" | "short_sleeve_top" | "trousers", stage: "paper" | "garment" | "landmarks" | "cutout" | "all", paperCorners?: [number, number][], bbox?: [number, number, number, number] }`。stage省略時はall。画像を遠近補正せず、A4の長辺を29.7cm、短辺を21cmとして縮尺を自動計算する。四隅・bbox・ランドマークはすべて送信画像の座標。

画面の1回の操作からpaper→garment→landmarks→cutoutを順に呼び、完了した工程に応じて0・25・50・75・100%を表示する。残り時間の予測値ではない。返却値に`cutoutBase64`（透過PNGまたはnull）と`cutoutWidthPx`・`cutoutHeightPx`（null可）を追加する。

保存APIは追加のmultipartファイル`cutoutImage`（RGBAのPNG、8MiB以下）を受け取る。画像roleは`cutout`を追加し、クローゼットでは優先表示する。切り抜きは表示専用で、測定点を持たない。新規保存のmeasurementVersionは`df2-a4-flat-midpoint-v2`。従来の補正済みデータはそのまま読める。v2ではmeasurement画像にA4四隅も保存し、originalImageは不要。

採寸と服の登録を実装した。アバター・コーデは設計候補で、APIは未実装。

3D表示から使うデータの意味と実装箇所は[3D担当向けの引き継ぎ](3d-handoff.md)を参照。

> ログイン前の`/api/*`はURLを知っていれば誰でも利用できる。[ADR 0002](adr/0002-no-login-yet.md)を参照。

## 経路

ブラウザ→webの`/api/*`→apiの`/v1/*`→Supabase。採寸時だけapi→ローカルのPython推論サービスを呼ぶ。サーバー間通信には別々のBearerトークンを使う。`profile_id`は受け取らず、apiの`DEMO_PROFILE_ID`を使用する。

JSONはcamelCase、DBはsnake_case。エラーはHTTPステータスと`{ error: string }`で返し、内部例外・SQL・秘密の値は出さない。

## 実装済みの経路

| メソッド | apiのパス              | 用途                                      |
| -------- | ---------------------- | ----------------------------------------- |
| GET      | `/health`              | 死活確認。ここだけ認証不要                |
| GET      | `/v1/inference-status` | モデルファイルの配置・読み込み状況        |
| POST     | `/v1/detections`       | A4縮尺・服の検出・ランドマーク・切り抜き  |
| GET      | `/v1/measurements`     | カテゴリ別の点番号・式・採寸バージョン    |
| POST     | `/v1/measurements`     | 修正した点から寸法を再計算                |
| GET      | `/v1/garments`         | 一覧。任意のcategoryで絞り込み、最新100件 |
| POST     | `/v1/garments`         | 写真・点・確定した寸法を登録              |
| GET      | `/v1/garments/:id`     | 詳細                                      |
| PATCH    | `/v1/garments/:id`     | 名前・寸法を変更                          |
| DELETE   | `/v1/garments/:id`     | 写真と服を削除                            |

webは同じパス構成で中継する。例：`/api/garments`→`/v1/garments`。healthだけは`/api/health`→`/health`。

## 採寸

### POST /v1/detections

multipartの`image`はJPEG、最大8MiB・1200万画素・各辺4096px。ブラウザでは向きを確定して長辺1600px以下のJPEGに描き直し、EXIFを除去する。`options`は次のJSON文字列。

```ts
{
  category: "short_sleeve_top" | "trousers" | "auto";
  paperCorners?: [number, number][];
  bbox?: [number, number, number, number];
  stage?: "paper" | "garment" | "landmarks" | "cutout" | "all";
}
```

四隅は送信画像上の外周順。長辺・短辺は画像上の長さから判断する。bboxは送信画像上の左上・右下で、手動指定する場合はカテゴリも必要。stage省略時は全工程を実行する。

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
  category: "short_sleeve_top" | "trousers";
  measurements: Measurements;
  measurementVersion: string;
  createdAt: string;
  images: {
    id: string;
    role: "original" | "measurement" | "cutout";
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

PATCHの入力は`{ name?, measurements? }`、成功は`200 { id }`。寸法オブジェクトは全体を置き換える。カテゴリ変更と保存後の点編集は初期版では非対応。DELETEは画像を先に消してから行を削除し、成功は204。途中失敗は503を返し、再試行できる。

## 共通の型

- カテゴリは初期版ではshort_sleeve_topとtrousersの2つ。
- 点番号はカテゴリ内の1始まり。scoreはヒートマップ値、手動点はnull。アノテーションの可視性vとは別物。
- MeasurementsはshoulderWidthCm・sleeveLengthCm・bodyWidthCm・bodyLengthCm・waistCm・hipCm・thighWidthCm・riseCm・inseamCm・hemWidthCm。各値は正のcmまたはnull。
- 新規登録のmeasurementVersionは`df2-a4-flat-midpoint-v2`。旧v1の取得・数値編集も可能。ウエストとヒップは幅の2倍。

## 後続の設計候補

`GET/PUT /v1/avatar`、`GET/POST /v1/outfits`、`DELETE /v1/outfits/:id`は未実装。[要件候補](requirements-candidates.md)で検討する。

## 参考文献

- [DeepFashion2](https://github.com/switchablenorms/DeepFashion2)：カテゴリ・点番号
- [HRNet公開実装](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch)：推論の入力と出力
