# apps/api のルール

全体のルールは [../../AGENTS.md](../../AGENTS.md)。

- **2層にする**：`src/routes/`（受け取りと zod の検証、返す形を整える）→ `src/services/`（処理と DB）
- **1ファイルには1つの処理だけを書く**：例 `src/services/create-garment.ts`
- **services 同士で呼び合わない**：共通の処理は `src/lib/` に置く。ESLint で止まる
- **Supabase のクライアントは [src/lib/supabase.ts](src/lib/supabase.ts) だけで作る**：secret key は RLS を素通りするため
- **`/v1/*` は共有トークン（Bearer）が無いと 401 を返す**：web（BFF）からだけ呼ばれる想定。`/health` だけは鍵なし
- **`profile_id` はリクエストから受け取らない**：今は `DEMO_PROFILE_ID` を使い、ログインを入れたらトークンから決める
- **web で使わない値は返さない**：エラーにも SQL やスタックトレースを入れない
- **値の単位は名前に入れる**：`height_cm`、`width_px` など
- **ルートは `new Hono().get(...).post(...)` のようにつなげて書く**：つなげないと web 側で型が推論されないため
- **`hono` のバージョンは web と api でそろえる**：ずれると web 側の型が壊れるため

## 参考文献

- [見よ、これがHonoのRPCだ（Zenn）](https://zenn.dev/yusukebe/articles/a00721f8b3b92e)
- [Hono: RPC](https://hono.dev/docs/guides/rpc)
- [Hono: Bearer Auth Middleware](https://hono.dev/docs/middleware/builtin/bearer-auth)
- [SupabaseのANON_KEYとSERVICE_ROLE_KEYの違いをちゃんと理解する（Zenn）](https://zenn.dev/seekseep/articles/supabase-anon-key-vs-service-role-key)
