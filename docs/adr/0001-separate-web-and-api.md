# 0001 webとapiを分け、ブラウザにDBのキーを渡さない

日付：2026-10-05

## 背景

ログインをまだ作らない（[0002](0002-no-login-yet.md)）。この状態でブラウザからSupabaseを直接触ると、ブラウザに渡したキーで誰でもDBを読み書きできてしまう。

## 決定

- web（Next.js）は画面とBFFだけを持ち、DBとSupabaseには触れない
- api（Hono）だけがsecret keyを持ち、DBとStorageに触れる
- webからapiへは共有トークン（Honoの`bearerAuth`）を付けて呼ぶ。`/health`以外はトークンが必須
- 全テーブルでRLSを有効にし、ポリシーは付けない

## 理由

- キーがサーバーにしか無いので、開発者ツールで見えない
- apiの型をHono RPCでwebがそのまま使えるので、2つに分けても型のずれが起きにくい
- 層をまたぐimportをESLintで止められる（webから`@supabase/*`をimportできない）

## 代替案

- ブラウザからSupabaseを直接使う：一番速く作れるが、ログインが無いと誰でも書き換えられる
- Next.jsだけで作る（Route HandlerからDBを触る）：サーバーは1つで済むが、画面とDBの境界があいまいになりやすい

## 影響

- サーバーが2つになる。`pnpm dev`で両方起動する
- デプロイ先も2つ必要になる（まだ決めていない）

## 参考文献

- [Next.jsの環境変数のセキュリティ（Zenn）](https://zenn.dev/masato24524/articles/eb87246a0bada1)：`NEXT_PUBLIC_`付きの環境変数にしたAPIキーが、開発者ツールで見えてしまった例
- [Next.jsで「API丸見え」を防ぐ設計（Zenn）](https://zenn.dev/tshishido/articles/9074645de87627)
- [SupabaseのANON_KEYとSERVICE_ROLE_KEYの違いをちゃんと理解する（Zenn）](https://zenn.dev/seekseep/articles/supabase-anon-key-vs-service-role-key)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Hono: Bearer Auth Middleware](https://hono.dev/docs/middleware/builtin/bearer-auth)
