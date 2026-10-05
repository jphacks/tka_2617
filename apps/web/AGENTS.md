<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# apps/web のルール

全体のルールは [../../AGENTS.md](../../AGENTS.md)。

- **BFF の役割だけを持つ**：DB と Supabase には触れない。`@supabase/*` の import は ESLint で止まる
- **api の呼び出しは [src/server/api.ts](src/server/api.ts) からだけ行う**：型は `@pitari/api` から `import type` で受け取る（Hono RPC）
- **`src/server/` のファイルには `import "server-only"` を書く**：クライアントから読み込まれたときに build で止めるため。書き忘れると ESLint で止まる
- **秘密の値を `NEXT_PUBLIC_` の環境変数にしない**：名前に SECRET・TOKEN・KEY などを含む `process.env.NEXT_PUBLIC_*` は ESLint で止まる
- **`/api/*` の Route Handler は api の `/v1/*` と同じパス構成で中継する**：見本は [src/app/api/health/route.ts](src/app/api/health/route.ts)。api のエラー内容はブラウザに出さない
- **useEffect は外部と同期するときだけ使う**：カメラや three.js などが該当する。それ以外は state と props の計算や、イベントハンドラで済ませる
- **スタイルは Tailwind で書く**

## 参考文献

- [エフェクトは必要ないかもしれない（React 公式）](https://ja.react.dev/learn/you-might-not-need-an-effect)
- [見よ、これがHonoのRPCだ（Zenn）](https://zenn.dev/yusukebe/articles/a00721f8b3b92e)
