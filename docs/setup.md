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

## mainを取り込んだあと

他の人の変更をmainから取り込んだら、画面を確かめる前に、依存・DB・推論サービスを今のmainに合わせる。どれかが古いと、画面は開いても、登録・裏面の保存・テクスチャの生成が失敗する。

1. mainを最新にする

   ```bash
   git switch main
   git pull
   ```

2. 依存を入れ直す。`pnpm-lock.yaml`が変わっていなくても、毎回実行してよい

   ```bash
   pnpm install
   ```

   Windowsでは、動いている`pnpm dev`がファイルをつかんで失敗することがある。そのときは先に`pnpm dev`を止める。

3. ローカルDBに、まだ当たっていないmigrationを当てる

   ```bash
   supabase migration list --local
   supabase migration up --local
   ```

   一覧で`Remote`（ローカルDBの側）が空の行が、まだ当たっていないmigration。`supabase db reset`はローカルのデータを消すので、ここでは使わない。

4. `pnpm dev`を止めて、起動し直す。ファイルの変更は自動で読み直すが、依存を入れ直したあとは起動し直す

5. 採寸やテクスチャを確かめるときは、推論サービスも止めて起動し直す。推論サービスはファイルの変更を読み直さない。`apps/inference/requirements.txt`が変わったときは、[推論サービスのREADME](../apps/inference/README.md)の手順で依存も入れ直す

   ```powershell
   ./apps/inference/.venv/Scripts/python.exe apps/inference/run.py
   ```

6. つながっているか確かめる
   - http://localhost:3000/api/health が`{"ok":true}`を返す
   - http://localhost:3000/api/inference-status の`weightsPresent`と`detectorPresent`が`true`。`modelLoaded`は最初の採寸までは`false`のまま

### ブラウザで確かめること

写真は、A4の用紙と服を同じ平面に平置きし、真上から撮る（[採寸の定義](measurement.md)）。

- 撮影（http://localhost:3000/capture ）：Tシャツ・長そで・パンツを撮り、「寸法を測定」→「クローゼットに登録」。種類が違えば「服の種類」で選び直す。裏面も撮れる
- クローゼット（http://localhost:3000/ ）から服の詳細：裏面の撮影と撮り直し、購入時期と季節の保存、「テクスチャを作る」
- アバター（http://localhost:3000/avatar ）：体・髪・服・靴を選んで着せる
- テクスチャ：受け付けると`apps/inference/textures/{生成日時}_{種類}_{服IDの先頭8文字}/`ができる。数十秒〜数分で`job.json`の`status`が`done`になり、フォルダと同じ名前の`.png`ができる

採寸とテクスチャには、Gitに含まれない次のものが要る。無くても、ほかの画面は確かめられる。

- 推論サービスの設定（`INFERENCE_TOKEN`）とモデル：[推論サービスのREADME](../apps/inference/README.md)
- UVテンプレート：Tシャツは`artifacts/uv/pitari/uv_template.json`、長そでは`artifacts/uv/pitari/longsleeve/uv_template.json`、ズボンは`artifacts/uv/pitari/trousers/uv_template.json`。無い種類は「テクスチャを作る」が503になる。元のモデル（`.blend`など）を持っている人から受け取って`artifacts/uv/pitari/inputs/`に置き、[UVテンプレートのREADME](../artifacts/uv/pitari/README.md)の手順で作る

## 服の採寸を開発するとき

Python推論サービスは別起動。依存の隔離・モデルの配置・画面の操作は[推論サービスのREADME](../apps/inference/README.md)を参照する。採寸画面は`http://localhost:3000/capture`。

mainを取り込んで新しいmigrationが入ったときは、上の「mainを取り込んだあと」の手順で当てる。

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

いちばん先に、gitleaksで、stagedの変更に鍵やトークンなどの秘密が混ざっていないかを調べる（`scripts/check-secrets.sh`）。gitleaksが無ければDockerで動かし、どちらも無ければ飛ばす。PRのCIの`secrets`は、履歴をすべて調べる。

- 見つかったら、その変更をstagedから外す。誤検出なら、その行の末尾に`gitleaks:allow`と書く
- 秘密をpushしてしまったら、履歴から消すだけでは足りない。公開リポジトリなので、見られた前提で鍵を無効にして作り直す

## DB を変えるとき

1. `supabase migration new <変更の名前>`でmigrationを作り、SQLを書く
   - `profiles`を作るときは、`supabase/seed.sql`にデモユーザー（`apps/api/.env.example`の`DEMO_PROFILE_ID`）の行も入れる。`supabase db reset`のたびに流れる
2. `supabase db reset`でローカルのDBに反映する
3. `pnpm --filter @pitari/api db:types`で型（`apps/api/src/lib/database.types.ts`）を作り直し、commitする。CLIの版で型の書き方が変わるので、手元のCLIではなく、`npx`で決まった版を使う（[ADR 0029](adr/0029-commit-db-types.md)）
4. [docs/er.md](er.md) を更新する

PRでは、CIの`db`（`.github/workflows/db.yml`）が、空のDBにmigrationと`seed.sql`を流し、`supabase db lint`でDBの関数を確かめる。作り直した型がcommitした型と違えば落ちる。`supabase/`かDBの型を変えたPRだけで動く。

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
