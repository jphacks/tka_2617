# 0030 APIの型はapiのzodから作ってHono RPCで渡し、Orvalは入れない

日付：2026-10-17

## 背景

AIがAPIの型を画面ごとに書くと、同じ形の型が何か所にもでき、少しずつずれていく。それを防ぐため、OpenAPIの定義（`openapi.yaml`）からOrvalでTypeScriptの型を作る案が出た。

調べると、今のPitariでは、APIの型はすでに機械的に作られていた。

- apiのzodスキーマから`z.infer`で型を作り、`apps/api/src/app.ts`からexportする
- webは`import type { GarmentView } from "@pitari/api"`のように受け取る
- webからapiは`src/server/api.ts`の`hc<AppType>`（Hono RPC）で呼び、入力と出力の型はapiのrouteから推論される

webで手書きしたAPIの型は無く、`openapi.yaml`も無い（2026-10-17）。

## 決定

- APIの型の出どころは、apiのzodスキーマとHonoのrouteだけにする。Orvalは入れない
- 新しいAPIの型は、apiでzodスキーマに書き、`z.infer`の型を`src/app.ts`からexportする
- webでは、APIと同じ形の型を書かない。`@pitari/api`から`import type`で受け取る

## 理由

- 型はすでに機械的に作られていて、生成のコマンドもファイルも要らない。zodを直せば、apiとwebの両方の型が変わる
- Orvalを足すと、型の出どころがzodと`openapi.yaml`の2つになる。片方だけ直すと、型と実装がずれる。避けるにはHono RPCをやめることになり、[0001](0001-separate-web-and-api.md)の理由（apiとwebで型のずれが起きにくい）とぶつかる
- Orvalの強みは、React QueryやSWRのHook、MSWのモックまで作れること。今のwebは、どれも使っていない
- webとapiは同じリポジトリで、どちらもTypeScript。言語やリポジトリをまたいで型を渡す必要が無い

## 代替案

- Orvalで、`openapi.yaml`から型とクライアントを作る：上のとおり、型の出どころが2つになるか、Hono RPCをやめることになる
- `@hono/zod-openapi`で、zodからOpenAPIを作る：Hono RPCと一緒に使え、手書きの`docs/api.md`を自動で作れるようになる。ただ、routesを`createRoute`の書き方に直す必要がある

## 影響

- `openapi.yaml`は作らない。APIの説明は、これまでどおり`docs/api.md`を手で直す。実装とずれる可能性は残る
- 見直す条件：TypeScript以外からAPIを使うことになったとき（ネイティブのアプリ、外部の開発者など）。または、`docs/api.md`と実装のずれが問題になったとき。その場合は、先に`@hono/zod-openapi`を考える

## 参考文献

- [Orval](https://orval.dev)：OpenAPIの定義から、型、クライアント、React QueryやSWRのHook、MSWのモックを作る
- [Hono: RPC](https://hono.dev/docs/guides/rpc)：サーバーとクライアントでAPIの仕様を共有する。`hc<AppType>`の型は、zodの検証と`c.json()`から推論される
- [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi)：zodでrouteを定義してOpenAPIの文書を作る。HonoのRPCのクライアントとも一緒に使える
