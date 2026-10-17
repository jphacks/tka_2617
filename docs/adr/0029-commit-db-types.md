# 0029 DBの型をmigrationから作ってcommitし、apiのSupabaseのクライアントに付ける

日付：2026-10-17

## 背景

`pnpm --filter @pitari/api db:types`で、migrationからDBの型（`apps/api/src/lib/database.types.ts`）を作れるようにはなっていた。ただ、作った型は一度もcommitされず、apiのSupabaseのクライアントも型なしで作っていた。そのため、テーブル名や列名を書き間違えても、型のチェックでは見つからなかった。AIがservicesを書くときに起きやすい誤りでもある。

また、Supabase CLIは版によって型の書き方が変わる。同じmigrationから、2.90.0と2.121.0で作った型を比べると、389行違った（2.121.0は整形されていない形で出る）。

## 決定

- DBの型をcommitし、`src/lib/supabase.ts`で`createClient<Database>`にする
- `db:types`は、手元に入れたCLIではなく、`npx --yes supabase@2.90.0`で作る。誰が作っても同じ型になる
- CIの`db`（`.github/workflows/db.yml`）で、空のDBから型を作り直し、commitした型と違えば落とす。CIのCLIも2.90.0に固定する
- 型のファイルは生成物なので、手で書き換えない。Prettier、ESLint、knipの対象から外す

## 理由

- 列名やテーブル名の誤りを、`pnpm typecheck`で見つけられる
- 最新のmigrationまで流したDBの型で試すと、今のservicesに型のエラーは無かった。コードを直さずに入れられる
- migrationを変えて型を作り直し忘れても、CIで止まる

## 代替案

- 型を付けない（今のまま）：何も増えないが、DBについての誤りは、動かすまで分からない
- CLIの版をそろえず、各自のCLIで作る：手元の版がばらばらなので、作るたびに型が変わり、CIも落ちる
- `supabase`をnpmの依存に入れて版を決める：`setup-cli`はロックファイルの版を読める。ただ、インストールのスクリプトを許す設定（`pnpm-workspace.yaml`）が要る

## 影響

- migrationを変えたら、`db:types`を流して型もcommitする必要がある。手元のDBに最新のmigrationが入っていないと、古い型ができる（`supabase migration up --local`か`supabase db reset`を先に流す）
- CLIの版を上げるときは、`apps/api/package.json`の`db:types`と`db.yml`の`version`の両方を変え、型を作り直す

## 参考文献

- [Supabase: Generating TypeScript Types](https://supabase.com/docs/guides/api/rest/generating-types)：`supabase gen types`で`database.types.ts`を作る
- [Supabase: Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)：CIで`supabase db start`の後に型を作り、`git diff`でcommitした型と比べる例
- [supabase/setup-cli](https://github.com/supabase/setup-cli)：`version`でCLIの版を固定する。省略するとロックファイルの`supabase`の版を使う
