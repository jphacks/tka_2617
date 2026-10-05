# ER 図

最低限の ER 図。要件は変わる前提なので、足すかもしれないデータは [requirements-candidates.md](requirements-candidates.md) に置いてある。まだ migration は無い。

```mermaid
erDiagram
  profiles ||--o| avatars : "体型"
  profiles ||--o{ garments : "持っている服"
  garments ||--o{ garment_images : "写真"
  profiles ||--o{ outfits : "コーデ"
  outfits ||--o{ outfit_garments : "含む服"
  garments ||--o{ outfit_garments : "使われる"

  profiles {
    uuid id PK
    text display_name
    timestamptz created_at
  }
  avatars {
    uuid id PK
    uuid profile_id FK, UK
    numeric height_cm "NULL 可"
    numeric weight_kg "NULL 可"
    timestamptz created_at
    timestamptz updated_at
  }
  garments {
    uuid id PK
    uuid profile_id FK
    text category "DeepFashion2 の13種類"
    text name "NULL 可"
    timestamptz created_at
    timestamptz updated_at
  }
  garment_images {
    uuid id PK
    uuid garment_id FK
    text storage_key "非公開バケットのキー"
    int width_px
    int height_px
    jsonb bbox "NULL 可"
    jsonb landmarks "NULL 可"
    text model_version "NULL 可"
    timestamptz created_at
  }
  outfits {
    uuid id PK
    uuid profile_id FK
    text name
    timestamptz created_at
  }
  outfit_garments {
    uuid outfit_id PK, FK
    uuid garment_id PK, FK
  }
```

- `profiles`：今は `DEMO_PROFILE_ID` の1行だけ。この行は `supabase/seed.sql` で入れる（無いと、服などの登録が外部キーで失敗する）。ログインを入れたら、`id` を Supabase Auth のユーザー ID と同じ値にする
- `garments.category`：`short_sleeve_top` / `long_sleeve_top` / `short_sleeve_outwear` / `long_sleeve_outwear` / `vest` / `sling` / `shorts` / `trousers` / `skirt` / `short_sleeve_dress` / `long_sleeve_dress` / `vest_dress` / `sling_dress`
- `garment_images.bbox`・`landmarks`：画像の座標なので、服ではなく画像に持たせる。推論に失敗しても保存できるよう NULL を許す。形式は [API 一覧](api.md#共通の型)
- RLS：全テーブルで有効にし、ポリシーは付けない。ブラウザ用のキーでは何も読めず、api だけが secret key で触れる
- Storage：バケットは非公開。画像は api が期限付きの URL を発行して返す
- `outfits`・`outfit_garments`：任意。後回しにしてよい

## 参考文献

- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)：RLS を有効にしてポリシーが無ければ、publishable key では何も読めない
- [SupabaseのANON_KEYとSERVICE_ROLE_KEYの違いをちゃんと理解する（Zenn）](https://zenn.dev/seekseep/articles/supabase-anon-key-vs-service-role-key)
- [DeepFashion2（GitHub）](https://github.com/switchablenorms/DeepFashion2)
