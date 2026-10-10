# apps/apiのルール

- `src/routes/`（受け取り・zod検証・レスポンス整形）→`src/services/`（処理・DB）の2層。routesからDBに触れない。
- 1ファイルに1つの処理を書く（例：`src/services/create-garment.ts`）。services同士は呼び合わず、共通処理は`src/lib/`へ。
- Supabaseクライアントは`src/lib/supabase.ts`だけで作る。secret keyはRLSを迂回する。
- `/v1/*`は共有Bearerトークン必須（無ければ401）。`/health`だけ認証不要。
- `profile_id`をリクエストから受け取らない。今は`DEMO_PROFILE_ID`、ログイン導入後はトークンから決める。
- webで使わない値は返さない。エラーにSQLやスタックトレースを含めない。
- 単位は名前に含める（`height_cm`、`width_px`など）。
- Honoのルートは型推論のため`new Hono().get(...).post(...)`のようにつなげる。`/v1`の追加は`src/app.ts`の`v1`の式につなげる。
- `hono`のバージョンはwebとapiでそろえる。
