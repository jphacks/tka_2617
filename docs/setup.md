# セットアップ

## 必要なもの

- Node.js 22（[.node-version](../.node-version)）
- pnpm（バージョンは [package.json](../package.json) の `packageManager`）
- Docker（ローカルの Supabase を動かすため）
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

## 手順

1. 依存を入れる。commit 前の git hook（lefthook）もここで入る

   ```bash
   pnpm install
   ```

2. ローカルの Supabase を起動する

   ```bash
   supabase start
   ```

3. 環境変数のファイルを作る

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

   - `SUPABASE_SECRET_KEY`：`supabase status -o env` の `SECRET_KEY`（古い CLI では `SERVICE_ROLE_KEY`）
   - `INTERNAL_API_TOKEN`：下のコマンドで作り、api と web の両方に同じ値を入れる

   ```bash
   openssl rand -hex 32
   ```

4. 起動する

   ```bash
   pnpm dev
   ```

   web は http://localhost:3000 、api は http://localhost:3001 で動く。http://localhost:3000/api/health が `{"ok":true}` を返せば、web から api までつながっている。

## commit するとき

lefthook が、staged のファイルを Prettier で整形し、ESLint で検査する。整形の結果は自動で staged に戻る。lint エラーがあると commit できない。

## DB を変えるとき

1. `supabase migration new <変更の名前>` で migration を作り、SQL を書く
2. `supabase db reset` でローカルの DB に反映する
3. `pnpm --filter @pitari/api db:types` で型を作り直す
4. [docs/er.md](er.md) を更新する

## 参考文献

- [【Lefthook】pre-commitで自動修正されたコードをステージングする方法（Qiita）](https://qiita.com/P-man_Brown/items/66b2349c529474033f64)：`stage_fixed` の使い方
