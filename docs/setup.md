# セットアップ

## 必要なもの

- Node.js 22（[.node-version](../.node-version)）
- pnpm（バージョンは [package.json](../package.json) の`packageManager`）
- Docker（ローカルのSupabaseを動かすため）
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)（Pythonを書く人だけ。commit前にruffを動かすため）：Macは`brew install uv`、Windowsは`winget install --id=astral-sh.uv -e`

## 手順

1. 依存を入れる。commit前のgit hook（lefthook）もここで入る

   ```bash
   pnpm install
   ```

2. ローカルのSupabaseを起動する

   ```bash
   supabase start
   ```

3. 環境変数のファイルを作る

   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

   - `SUPABASE_SECRET_KEY`：`supabase status -o env`の`SECRET_KEY`（古いCLIでは`SERVICE_ROLE_KEY`）
   - `INTERNAL_API_TOKEN`：下のコマンドで作り、apiとwebの両方に同じ値を入れる

   ```bash
   openssl rand -hex 32
   ```

4. 起動する

   ```bash
   pnpm dev
   ```

   webは http://localhost:3000 、apiは http://localhost:3001 で動く。http://localhost:3000/api/health が`{"ok":true}`を返せば、webからapiまでつながっている。

## 服の採寸を開発するとき

Python推論サービスは別起動。依存の隔離・モデルの配置・画面の操作は[推論サービスのREADME](../apps/inference/README.md)を参照する。採寸画面は`http://localhost:3000/capture`。

既存のローカルDBに新しいmigrationだけを適用する場合は`supabase migration up --local`を使う。`db reset`は既存のローカルデータを消すため、保存済みデータが必要な環境では実行しない。

## スマホで撮影する

PCとスマホを同じWi-Fiに接続する。PCでAPI・Python推論・Supabaseを起動したまま、webをLAN向けに起動する。すでに3000番でwebが動いていれば、そのwebだけ停止してから実行する。

```powershell
npx --yes pnpm@10.18.0 --filter @pitari/web exec next dev --hostname 0.0.0.0
```

PCで`ipconfig`を実行し、Wi-FiのIPv4アドレスを確認する。スマホのSafariまたはChromeから`http://PCのIPv4アドレス:3000/capture`を開く。スマホでlocalhostを使うとスマホ自身を参照するため、PCへ接続できない。

「写真を選ぶ・撮影」をタップすると、対応する端末で背面カメラまたは撮影方法の選択画面が開く。撮影を確定し、「寸法を測定」を押す。推論はPCで実行するため、PCをスリープさせない。保存画像もweb経由で取得するので、スマホからStorageのポートへ接続する必要はない。

画面が開かない場合は、PCの同じURLでも開けるか確認する。PCだけ開ける場合はWindowsファイアウォールのTCP3000の受信許可と、Wi-Fiの端末間通信制限を確認する。ファイアウォール全体を無効化しない。受信許可は信頼できるネットワーク・ローカルサブネットに限定する。ログイン未実装のため、ルーターのポート開放やインターネット公開は行わない。

現在は端末の撮影機能を使うfile入力方式。web画面内に動画のカメラプレビューを埋め込むgetUserMedia方式は未実装で、その方式には原則HTTPSが必要。capture属性の挙動はOS・ブラウザに依存する。

参考：[MDNのcapture属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)、[getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。

## commit前の確認

lefthookが、stagedのファイルをPrettierで整形し、ESLintで検査する。mdは、Prettierの前にtextlintで英語と日本語の間の空白を消す。手で`pnpm lint:md --fix`したときは、続けて`pnpm format`する。整形の結果は自動でstagedに戻る。lintエラーがあるとcommitできない。

Pythonのファイルは、uvがあればruffで検査して整形する（[ADR 0022](adr/0022-python-lint-with-ruff.md)）。uvが無いときは飛ばすが、PRのCIで同じ検査が走る。まだruffをかけていないディレクトリは、`ruff.toml`の`extend-exclude`にある。

## DB を変えるとき

1. `supabase migration new <変更の名前>`でmigrationを作り、SQLを書く
   - `profiles`を作るときは、`supabase/seed.sql`にデモユーザー（`apps/api/.env.example`の`DEMO_PROFILE_ID`）の行も入れる。`supabase db reset`のたびに流れる
2. `supabase db reset`でローカルのDBに反映する
3. `pnpm --filter @pitari/api db:types`で型を作り直す
4. [docs/er.md](er.md) を更新する

## webをVercelにデプロイする

mainにマージすると、CIが通った後にGitHub Actionsが本番に出す（`.github/workflows/ci.yml`の`deploy`、[ADR 0004](adr/0004-deploy-web-with-vercel-cli.md)）。ふだんは何もしなくてよい。今はwebだけを出している。

### Actionsに置いてあるsecret

| 名前                | 中身                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | Vercelの鍵。VercelのAccount Settingsの「Tokens」で作る。Scopeはpitariのプロジェクトだけにし（「All Projects」にしない）、有効期限を付ける |
| `VERCEL_ORG_ID`     | `.vercel/project.json`の`orgId`                                                                                                           |
| `VERCEL_PROJECT_ID` | `.vercel/project.json`の`projectId`                                                                                                       |

鍵を作り直したら`gh secret set VERCEL_TOKEN`で入れ直す（値は画面に出さずに入力できる）。

### 手元から出すとき

Actionsが止まっているときなどは、手元のMacからも出せる。

1. mainの最新に切り替える。CLIは手元のファイルをそのまま送るので、commitしていない変更も載ってしまう

   ```bash
   git switch main && git pull
   ```

2. リポジトリのルートで、本番に出す

   ```bash
   npx vercel --prod
   ```

   初めてのときだけ、ログインとプロジェクトの設定を聞かれる。
   - ログインは「Continue with GitHub」
   - 「Link to existing project?」は`y`で、`pitari`を選ぶ
   - Gitのリポジトリとつなぐか聞かれたら`n`（orgの許可が無いため）

3. 表示された本番のURLを開いて確かめる。スマホで試すときも本番のURLを使う（`--prod`なしで出したお試しのURLは、Vercelにログインしないと見られない）

### 気をつけること

- `.env`などの秘密のファイルは、ルートの`.vercelignore`で送らないようにしてある。秘密のファイルを足したら、`.vercelignore`にも足す
- Vercelでのインストールは、`apps/web/vercel.json`でスクリプトを動かさないようにしてある。送ったファイルには`.git`が無く、`lefthook install`が失敗するため

## 参考文献

- [【Lefthook】pre-commitで自動修正されたコードをステージングする方法（Qiita）](https://qiita.com/P-man_Brown/items/66b2349c529474033f64)：`stage_fixed`の使い方
