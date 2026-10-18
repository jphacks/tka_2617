# Pitari

服の写真とDeepFashion2のランドマークを保存し、体型を変えられる.glbアバターに着せるクローゼットアプリ。推論は`apps/inference`がPCのCPUで行い、apiから呼ぶ。入れ方は[推論サービスのREADME](apps/inference/README.md)。

## 構成とコマンド

- ブラウザ→`apps/web`（Next.js、画面とBFF）→`apps/api`（Hono）→Supabase。DBとStorageに触れるのはapiだけ。
- 画面はスマホ向けのPWA（[ADR](docs/adr/0003-pwa.md)）。ネイティブのアプリは作らない。
- 各アプリのルール：[web](apps/web/AGENTS.md)、[api](apps/api/AGENTS.md)。3Dモデルを作るBlenderのスクリプトは`assets/blender/`（[ルール](assets/blender/AGENTS.md)）。
- 開発：`pnpm install`、`pnpm dev`。確認：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。整形：`pnpm format`。
- Python：`uvx ruff@0.17.1 check --fix`、`uvx ruff@0.17.1 format`。ruffの対象から外しているディレクトリは、`ruff.toml`の`extend-exclude`にある。
- ローカルDB：`supabase start`。DBの型を作る：`pnpm --filter @pitari/api db:types`。
- 必要なときに読む：[初回セットアップとmainを取り込んだあと](docs/setup.md)、[API一覧](docs/api.md)、[ER図](docs/er.md)、[候補要件](docs/requirements-candidates.md)、[ADR](docs/adr/README.md)。

## 開発ルール

- 読みやすい名前と素直なコードを選ぶ。共通化は本当に同じ処理だけ。コメントは必要な「なぜ」だけを書く。仕様番号は振らない。
- 処理（apiの`src/services`・`src/lib`、webの`src/lib`）を足す・変えるときは、同じPRでそのアプリの`tests/`にテストも足す。書かないなら、PR本文に理由を書く。CIの`pr-tests`が警告する。
- 書き直したら、使わなくなったファイル・export・依存を消す。`pnpm knip`で見つかり、CIでも止まる。「あとで使う」exportは、使うときに足す。
- importはwebで`@/`、apiで`#src/`を使う。
- deprecatedな書き方を避ける。Next.jsで書く前に、`apps/web/node_modules/next/dist/docs`で実装する機能のガイドを読む。
- docs・コメントは日本語。PR本文やレビューを含め、英語と日本語の間に半角スペースを入れない。コード・コマンド・URLの空白は維持する。mdは`pnpm lint`のtextlintで確かめる。書き方は[yomiyasu](.claude/skills/yomiyasu/SKILL.md)に沿う。
- API追加は`docs/api.md`→zodスキーマ→apiのroute→webのBFFの順。
- DBは`supabase/migrations`だけで変える。新しいテーブルはRLSを有効にし、`docs/er.md`を更新する。DBの型は`db:types`で作り直してcommitする（手で書き換えない）。
- 設計上の決定は`docs/adr/`に1件ずつ残す。候補要件は`docs/requirements-candidates.md`へ。

## commitとPR

- ブランチは`feature/<自分の名前>/<内容>`。PRは目的を1つにする。
- PRの差分は400行くらいまで。`bash scripts/pr-size.sh`で数える。生成物・バイナリ・テストは数えない。PRのマージ先と比べるので、積み上げたPRでも、そのPRの分だけを数える。超えそうなら先にPRを分け、分けないなら本文に理由を書く。
- commitは、それだけで意味が通り、lintと型が通る単位に分ける。整形・名前の変更・生成物の更新は、機能の変更と別のcommitにする。
- メッセージは`feat(web): 〜する`の形（`fix`・`docs`・`chore`・`ci`・`refactor`など）。本文に「なぜ」を書く。
- PR本文は`.github/pull_request_template.md`に沿って書く。

## セキュリティと権限

- 外部API・backend呼び出しは`apps/web/src/server/`に置き、先頭で`import "server-only"`する。秘密の値を`NEXT_PUBLIC_`にしない。
- `.env`をcommitしない。環境変数を追加したら`.env.example`も更新する。
- ログインがまだ無いので、公開された`/api/*`から誰でも登録・削除できる。個人情報を返すAPIなど、このリスクを広げる変更は禁止。詳細は[ADR](docs/adr/0002-no-login-yet.md)。
- force push、`--no-verify`、クラウドのDBへの反映（`supabase db push`など）は禁止。Claudeは`.env`の読み取りも禁止。
- 依存の追加（`pnpm add`）、`git push`、`supabase link`は、実行する前に確認する。
- 権限設定は`.claude/settings.json`と`.codex/rules/project.rules`。変えるときは両方をそろえる。設定で止められない書き方でも、上の決まりを守る。
