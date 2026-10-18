# apps/apiのルール

- `src/routes/`（受け取り・zod検証・レスポンス整形）→`src/services/`（処理・DB）の2層。routesからDBに触れない。
- 1ファイルに1つの処理を書く（例：`src/services/create-garment.ts`）。services同士は呼び合わず、共通処理は`src/lib/`へ。
- Supabaseクライアントは`src/lib/supabase.ts`だけで作る。secret keyは、RLSを通らずに読み書きできる。
- `/v1/*`には、共有のBearerトークンが要る（無ければ401）。認証が要らないのは`/health`だけ。
- `profile_id`をリクエストから受け取らない。今は`DEMO_PROFILE_ID`を使い、ログインを入れたあとはトークンから決める。
- webで使わない値は返さない。エラーにSQLやスタックトレースを含めない。
- 単位は名前に含める（`height_cm`、`width_px`など）。
- Honoのルートは、型が推論されるように`new Hono().get(...).post(...)`のようにつなげる。`/v1`の追加は`src/app.ts`の`v1`の式につなげる。
- `hono`のバージョンはwebとapiでそろえる。
