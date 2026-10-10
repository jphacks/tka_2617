# Pitari

服の写真とDeepFashion2のランドマークを保存し、体型を変えられる.glbアバターに着せるクローゼットアプリ。推論の実行場所は未定。

## 構成とコマンド

- ブラウザ→`apps/web`（Next.js、画面とBFF）→`apps/api`（Hono）→Supabase。DBとStorageに触れるのはapiだけ。
- 各アプリのルール： [web](apps/web/AGENTS.md)、[api](apps/api/AGENTS.md)。
- 開発：`pnpm install`、`pnpm dev`。確認：`pnpm lint`、`pnpm typecheck`、`pnpm build`。整形：`pnpm format`。
- ローカルDB：`supabase start`。DB型生成：`pnpm --filter @pitari/api db:types`。
- 必要なときに読む：[初回セットアップ](docs/setup.md)、[API一覧](docs/api.md)、[ER図](docs/er.md)、[候補要件](docs/requirements-candidates.md)、[ADR](docs/adr/README.md)。

## 開発ルール

- 読みやすい名前と素直なコードを選ぶ。共通化は本当に同じ処理だけ。コメントは必要な「なぜ」だけを書く。仕様番号は振らない。
- importはwebで`@/`、apiで`#src/`を使う。
- deprecatedな書き方を避ける。Next.jsの実装前に`apps/web/node_modules/next/dist/docs`の該当ガイドを確認する。
- docs・コメントは日本語。PR本文やレビューを含め、英語と日本語の間に半角スペースを入れない。コード・コマンド・URLの空白は維持する。
- API追加は`docs/api.md`→zodスキーマ→apiのroute→webのBFFの順。
- DB変更は`supabase/migrations`のみ。新しいテーブルはRLSを有効にし、`docs/er.md`を更新する。
- 設計上の決定は`docs/adr/`に1件ずつ残す。候補要件は`docs/requirements-candidates.md`へ。

## セキュリティと権限

- 外部API・backend呼び出しは`apps/web/src/server/`に置き、先頭で`import "server-only"`する。秘密の値を`NEXT_PUBLIC_`にしない。
- `.env`をcommitしない。環境変数を追加したら`.env.example`も更新する。
- ログイン未実装で、公開された`/api/*`から登録・削除が可能。個人情報を返すAPIなど、このリスクを広げる変更は禁止。詳細は[ADR](docs/adr/0002-no-login-yet.md)。
- force push、`--no-verify`、クラウドDBへの反映（`supabase db push`など）は禁止。Claudeは`.env`の読み取りも禁止。
- 依存追加（`pnpm add`）、`git push`、`supabase link`は確認する。
- 権限設定は`.claude/settings.json`と`.codex/rules/project.rules`。変更時は両方を合わせる。設定で検出できない書き方でも、上記の制約を守る。
