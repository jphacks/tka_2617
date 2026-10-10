<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/webのルール

- DB・Supabaseに触れない。
- api呼び出しは`src/server/api.ts`のみ。型は`@pitari/api`から`import type`で受け取る（Hono RPC）。
- `src/server/`の全ファイルに`import "server-only"`を書く。
- 画面から呼ぶのは自分の`/api/*`だけ。外部URLのfetchと`hono/client`のimportは`src/server/`内だけ。
- 秘密の値を`NEXT_PUBLIC_`の環境変数にしない。
- `/api/*`のRoute Handlerはapiの`/v1/*`と同じパス構成で中継する。見本は`src/app/api/health/route.ts`。apiのエラー詳細をブラウザに出さない。
- useEffectはカメラやthree.jsなど外部との同期だけに使う。それ以外はstate・propsの計算やイベントハンドラで済ませる。
- スタイルはTailwindで書く。
