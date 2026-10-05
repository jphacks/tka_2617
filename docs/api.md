# API 一覧

最低限の一覧。要件は変わる前提なので、足りなければまずここを書き足す。`GET /health` 以外はまだ未実装。

> **既知のリスク**：ログインを入れるまで、`/api/*` は URL を知っていれば誰でも叩ける。詳しくは [ADR 0002](adr/0002-no-login-yet.md)。

## 経路

```
ブラウザ → apps/web /api/*（BFF） → apps/api /v1/*（Bearer トークン） → Supabase
```

- web の `/api/*` は、api の `/v1/*` と同じパス構成で中継する（例：`/api/garments` → `/v1/garments`）
- `profile_id` はリクエストに含めない。api が決める（今は `DEMO_PROFILE_ID`、ログイン後はトークンから）

## 書き方の約束

- JSON のキーは camelCase、DB の列は snake_case。変換は api の `routes/` で行う
- 入力は api の `routes/` で zod を使って検証する
- エラーは HTTP ステータスと `{ "error": "<画面に出してよい短い文>" }` で返す。SQL やスタックトレースは入れない

## 一覧

| メソッド | パス               | 用途                                         | 状態                   |
| -------- | ------------------ | -------------------------------------------- | ---------------------- |
| GET      | `/health`          | 死活確認                                     | 実装済み               |
| POST     | `/v1/detections`   | 写真から服のカテゴリとランドマークを推論する | 未実装（置き場所未定） |
| GET      | `/v1/garments`     | 服の一覧                                     | 未実装                 |
| GET      | `/v1/garments/:id` | 服の詳細                                     | 未実装                 |
| POST     | `/v1/garments`     | 服を登録する                                 | 未実装                 |
| PATCH    | `/v1/garments/:id` | 名前とカテゴリを変える                       | 未実装                 |
| DELETE   | `/v1/garments/:id` | 服を消す（画像も消す）                       | 未実装                 |
| GET      | `/v1/avatar`       | アバターの設定を取る                         | 未実装                 |
| PUT      | `/v1/avatar`       | 身長と体重を保存する                         | 未実装                 |
| GET      | `/v1/outfits`      | コーデの一覧（任意）                         | 未実装                 |
| POST     | `/v1/outfits`      | コーデを保存する（任意）                     | 未実装                 |
| DELETE   | `/v1/outfits/:id`  | コーデを消す（任意）                         | 未実装                 |

## 中身

型の `Category`・`BBox`・`Landmarks` は下の「共通の型」を参照。

### `POST /v1/detections`

- 入力：multipart の `image`（JPEG）
- 出力：`{ category: Category, bbox: BBox, landmarks: Landmarks, modelVersion: string }`
- 推論をブラウザの中で行うことになったら、このエンドポイントは消す

### `GET /v1/garments?category=<Category>`

- 出力：`{ garments: { id, name, category, imageUrl, createdAt }[] }`
- `imageUrl` は期限付きの署名 URL（Storage のバケットは非公開）

### `GET /v1/garments/:id`

- 出力：`{ id, name, category, images: { id, url, widthPx, heightPx, bbox, landmarks }[] }`

### `POST /v1/garments`

- 入力：multipart
  - `image`：JPEG。ブラウザで縮小して JPEG に描き直してから送る（位置情報などの EXIF を落とすため）
  - `category`、`name`（任意）
  - `bbox`、`landmarks`、`modelVersion`（任意。推論の結果。JSON 文字列で送る）
- 出力：`201 { id }`

### `PATCH /v1/garments/:id`

- 入力：`{ name?, category? }`
- 出力：`200 { id }`

### `DELETE /v1/garments/:id`

- 出力：`204`

### `GET /v1/avatar` / `PUT /v1/avatar`

- 入力（PUT）：`{ heightCm: number, weightKg: number }`
- 出力：`{ heightCm: number | null, weightKg: number | null }`

### `GET /v1/outfits` / `POST /v1/outfits` / `DELETE /v1/outfits/:id`（任意）

- 入力（POST）：`{ name, garmentIds: string[] }`
- 出力：一覧は `{ outfits: { id, name, garmentIds }[] }`、作成は `201 { id }`、削除は `204`

## 共通の型

- `Category`：DeepFashion2 の13種類。値の一覧は [ER 図](er.md) を参照
- `BBox`：`[x1, y1, x2, y2]`（左上と右下）
- `Landmarks`：`[x, y, v][]`。DeepFashion2 の `[x1, y1, v1, x2, y2, v2, ...]` を3つずつ区切ったもの。点の数と順番はカテゴリごとに DeepFashion2 の定義に従う
  - `v`：`2` 見えている / `1` 隠れている / `0` ラベルなし
- 座標はすべて、元の画像のピクセル

## 参考文献

- [見よ、これがHonoのRPCだ（Zenn）](https://zenn.dev/yusukebe/articles/a00721f8b3b92e)：zod の検証と型の共有
- [Hono: RPC](https://hono.dev/docs/guides/rpc)
- [Next.jsで「API丸見え」を防ぐ設計（Zenn）](https://zenn.dev/tshishido/articles/9074645de87627)：Route Handler を BFF にする考え方
- [DeepFashion2（GitHub）](https://github.com/switchablenorms/DeepFashion2)：カテゴリ、ランドマーク、bbox の形式
