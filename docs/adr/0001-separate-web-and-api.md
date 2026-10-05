# 0001 web と api を分け、ブラウザに DB のキーを渡さない

日付：2026-10-05

## 背景

ログインをまだ作らない（[0002](0002-no-login-yet.md)）。この状態でブラウザから Supabase を直接触ると、ブラウザに渡したキーで誰でも DB を読み書きできてしまう。

## 決定

- web（Next.js）は画面と BFF だけを持ち、DB と Supabase には触れない
- api（Hono）だけが secret key を持ち、DB と Storage に触れる
- web から api へは共有トークン（Hono の `bearerAuth`）を付けて呼ぶ。`/health` 以外はトークンが必須
- 全テーブルで RLS を有効にし、ポリシーは付けない

## 理由

- キーがサーバーにしか無いので、開発者ツールで見えない
- api の型を Hono RPC で web がそのまま使えるので、2つに分けても型のずれが起きにくい
- 境界を ESLint で止められる（web から `@supabase/*` を import できない）

## 代替案

- ブラウザから Supabase を直接使う：一番速く作れるが、ログインが無いと誰でも書き換えられる
- Next.js だけで作る（Route Handler から DB を触る）：サーバーは1つで済むが、画面と DB の境界があいまいになりやすい

## 影響

- サーバーが2つになる。`pnpm dev` で両方起動する
- デプロイ先も2つ必要になる（まだ決めていない）

## 参考文献

- [Next.jsの環境変数のセキュリティ（Zenn）](https://zenn.dev/masato24524/articles/eb87246a0bada1)：`NEXT_PUBLIC_` 付きの環境変数にした API キーが、開発者ツールで見えてしまった例
- [Next.jsで「API丸見え」を防ぐ設計（Zenn）](https://zenn.dev/tshishido/articles/9074645de87627)
- [SupabaseのANON_KEYとSERVICE_ROLE_KEYの違いをちゃんと理解する（Zenn）](https://zenn.dev/seekseep/articles/supabase-anon-key-vs-service-role-key)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Hono: Bearer Auth Middleware](https://hono.dev/docs/middleware/builtin/bearer-auth)
