# サンプル（プロダクト名）

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2026/07/IMG_5316.png)](https://www.youtube.com/watch?v=piaNsc6ilBI)

## ローカルの環境構築

必要なもの：Node.js 22、pnpm 10.18.0、Docker Desktop、Supabase CLI。Docker Desktopを起動して、リポジトリのルートで実行する。

```bash
pnpm install
supabase start
```

初回だけ、環境変数ファイルを作る。既にある場合はコピーせず、そのまま使う。

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

- `apps/api/.env`の`SUPABASE_SECRET_KEY`に、`supabase status -o env`で表示される`SECRET_KEY`を設定する（古いCLIでは`SERVICE_ROLE_KEY`）。
- `openssl rand -hex 32`でトークンを生成し、両方のファイルの`INTERNAL_API_TOKEN`に同じ値を設定する。
- `.env`類や秘密の値はcommitしない。

```bash
pnpm dev
```

画面は<http://localhost:3000>、apiは<http://localhost:3001>。<http://localhost:3000/api/health>が`{"ok":true}`を返せば、webからapiへの接続を確認できる。

Dockerを使うのはローカルSupabaseだけ。`supabase start`後にDocker Desktopにコンテナが表示される。webとapiは`pnpm dev`で直接起動する。

停止は`pnpm dev`のターミナルで`Ctrl+C`、Supabaseは`supabase stop`。DB変更やデプロイの手順は[セットアップ](docs/setup.md)を参照する。

## 製品概要
### 背景(製品開発のきっかけ、課題等）
### 製品説明（具体的な製品の説明）
### 特長
#### 1. 特長1
#### 2. 特長2
#### 3. 特長3

### 解決出来ること
### 今後の展望
### 注力したこと（こだわり等）
* **AIが書いても崩れない開発の仕組み**：3人ともAI（Claude Code、Codex）でコードを書く。AIが毎回読む指示（[AGENTS.md](AGENTS.md)）は短くし、守ってほしいことはlintとCIで機械的に止めた。止まったときのメッセージには「なぜ・代わりにどうするか」を日本語で書いたので、AIがそれを読んで自分で直せる
* **決めたことと理由を残す**：設計の判断を30件を超えるADR（[docs/adr](docs/adr/README.md)）に残し、AIが前提を知らずに作りを変えてしまうのを防いだ
* **ログインが無くても、DBの鍵をブラウザに出さない**：画面（Next.js）と、DBに触れるapi（Hono）を分け、鍵はapiだけが持つ（[ADR 0001](docs/adr/0001-separate-web-and-api.md)）。webはapiの型をHono RPCでそのまま使うので、分けても型はずれない

| いつ | 何で止めるか |
| --- | --- |
| commitの前（lefthook） | gitleaks（鍵やトークンの混入）、Prettier、ESLint、textlint（英語と日本語の間の空白）、ruff（Python） |
| PRのCI | 上に加えて、型、テスト、build、knip（使っていないコードと依存）、actionlint（workflowの書き間違い）、gitleaks（履歴すべて）。DBに関係するファイルを変えたPRだけ、migrationとDBの型。PRの行数（400行超）と、テストの無い処理の変更は、警告だけで落とさない |
| マージの後 | mainへのマージで本番に自動で出す。開発用のページは本番では404 |
| AIの権限 | Claude Codeは、force push、フックを飛ばすcommit、クラウドのDBへの反映、`.env`の読み取りを止める（[.claude/settings.json](.claude/settings.json)）。Codexは、force push、フックを飛ばすcommit、クラウドのDBへの反映を止め、pushと依存の追加は確認する。ルールはコマンドの先頭一致なので、`git push origin --force`のように途中にフラグがある形は止められず、pushの確認に回る（[.codex/rules/project.rules](.codex/rules/project.rules)） |

## 開発技術
### 活用した技術
#### API・データ
* 
* 

#### フレームワーク・ライブラリ・モジュール
* 
* 

#### デバイス
* 
* 

### 独自技術
#### ハッカソンで開発した独自機能・技術
* **AIの誤りを止める独自のlintのルール**：サーバー専用のファイルに`import "server-only"`を書き忘れる、秘密に見える名前の環境変数を`NEXT_PUBLIC_`にする、画面から外部のURLを直接呼ぶ、Honoのルートを別の文で足してwebから型が見えなくなる、などを止める（[apps/web/eslint.config.mjs](apps/web/eslint.config.mjs)、[apps/api/eslint.config.mjs](apps/api/eslint.config.mjs)）
* **Blenderが書き出した3Dの表を、webのテストで確かめる**：服の表（身長・体型ごとのシェイプキーの効き方）を実際に読み、4体型×4身長で「寸法からキーを解き、キーから寸法を作り直すと元に戻るか」を確かめる。ズボンは、写真の寸法が矛盾しても、キーの値が暴れないことを確かめる（抑えないと284まで、抑えると15.8に収まる）（[apps/web/tests/](apps/web/tests/)）
* **PRの大きさの警告**：ロックファイルやBlenderの書き出しなどの生成物に印を付けて除き（[.gitattributes](.gitattributes)）、テストも除いて、400行を超えたら警告する。AIが作るPRは大きくなりやすく、テストを数えるとテストを書かなくなるため（[scripts/pr-size.sh](scripts/pr-size.sh)）
* **テストの書き忘れの警告**：処理（apiの`src/services`・`src/lib`、webの`src/lib`）を変えたのに、同じアプリの`tests/`が変わっていないPRで、そのファイルに警告を付ける。AIに処理を書かせても、テストが一緒に作られなかったため（[scripts/pr-tests.sh](scripts/pr-tests.sh)）
* **migrationを空のDBで確かめる**：DBに関係するファイルを変えたPRと、mainへのマージのときに、SupabaseのDBを空の状態で起動する。migrationとseedが最後まで通るか、DBの関数に誤りが無いか、commitしたDBの型がmigrationと合っているかを確かめる（[.github/workflows/db.yml](.github/workflows/db.yml)）
