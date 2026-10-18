# セットアップ

## 必要なもの

- Node.js 22（[.node-version](../.node-version)）
- pnpm（バージョンは[package.json](../package.json)の`packageManager`）
- Docker（ローカルのSupabaseを動かすため）
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)（Pythonを書く人だけ。commitの前にruffを動かすため）：Macは`brew install uv`、Windowsは`winget install --id=astral-sh.uv -e`

## 手順

1. 依存を入れる。commitの前に動くgit hook（lefthook）も、ここで入る

   ```bash
   pnpm install
   ```

2. ローカルのSupabaseを起動する

   ```bash
   supabase start
   ```

   初めて起動したときは、[ダミーの服](#ダミーの服)が4着入る

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

   webは<http://localhost:3000>、apiは<http://localhost:3001>で動く。<http://localhost:3000/api/health>が`{"ok":true}`を返せば、webからapiまでつながっている。

ここまでで、[ダミーの服](#ダミーの服)を使ってクローゼット・アバター・今日のコーデを試せる。採寸とテクスチャ作成も試すときは、続けて「[モデルとUVテンプレートを受け取る](#モデルとuvテンプレートを受け取る)」を済ませる。

## mainを取り込んだあと

ほかの人の変更をmainから取り込んだら、画面を確かめる前に、依存・DB・推論サービスを今のmainに合わせる。どれかが古いと、画面は開いても、登録・裏面の保存・テクスチャの生成が失敗する。

1. 動いている`pnpm dev`と推論サービスを止める。Windowsでは、動いているプログラムがファイルを開いたままになり、次の`pnpm install`が失敗することがある

2. mainの変更を取り込む

   ```bash
   git switch main
   git pull
   ```

   作業中のブランチに取り込むときは、ブランチを切り替えずに`git fetch origin`→`git merge origin/main`とする。手順3からは同じ

3. 依存を入れ直す。`pnpm-lock.yaml`が変わっていなくても、毎回実行してよい

   ```bash
   pnpm install
   ```

4. ローカルDBに、まだ当たっていないmigrationを当てる

   ```bash
   supabase migration list --local
   supabase migration up --local
   ```

   一覧で`Remote`（ローカルDBの側）が空の行が、まだ当たっていないmigration。`supabase db reset`はローカルのデータを消すので、ここでは使わない。

5. `pnpm dev`を起動し直す

   ```bash
   pnpm dev
   ```

6. 採寸やテクスチャを確かめるときは、推論サービスも起動し直す。推論サービスはファイルの変更を読み直さないので、起動し直さないと古いコードのまま動く。`apps/inference/requirements.txt`が変わったときは、[推論サービスのREADME](../apps/inference/README.md)の手順で依存も入れ直す

   ```bash
   # Windows
   ./apps/inference/.venv/Scripts/python.exe apps/inference/run.py
   # Mac
   ./apps/inference/.venv/bin/python apps/inference/run.py
   ```

7. つながっているか確かめる
   - http://localhost:3000/api/health が`{"ok":true}`を返す
   - http://localhost:3000/api/inference-status の`weightsPresent`と`detectorPresent`が`true`。`modelLoaded`は最初の採寸までは`false`のまま

### ブラウザで確かめること

写真は、A4の紙と服を同じ平面に平らに置き、真上から撮る（[採寸の定義](measurement.md)）。

- 撮影（http://localhost:3000/capture ）：Tシャツ・長そで・パンツを撮り、「寸法を測定」→「クローゼットに登録」。種類が違えば「服の種類」で選び直す。裏面も撮れる
- クローゼット（http://localhost:3000/ ）から服の詳細：裏面の撮影と撮り直し、購入時期と季節の保存、「テクスチャを作る」
- アバター（http://localhost:3000/avatar ）：体・髪・服・靴を選んで着せる
- テクスチャ：受け付けると`apps/inference/textures/{生成日時}_{種類}_{服IDの先頭8文字}/`ができる。数十秒〜数分で`job.json`の`status`が`done`になり、フォルダと同じ名前の`.png`ができる

採寸とテクスチャには、推論サービスの設定（`INFERENCE_TOKEN`、[推論サービスのREADME](../apps/inference/README.md)）と、Gitに入れていないモデルとUVテンプレートが要る。用意のしかたは、下の「[モデルとUVテンプレートを受け取る](#モデルとuvテンプレートを受け取る)」に書いた。無くても、[ダミーの服](#ダミーの服)でほかの画面は確かめられる。

## ダミーの服

クローンした直後でも、クローゼット・アバター・今日のコーデを試せるように、ダミーの服を4着入れてある（Tシャツ・パジャマ・スラックス2本）。服の行は`supabase/seed.sql`、画像は`supabase/seed/garments/`にある。`supabase start`で初めてDBを作ったときと、`supabase db reset`のときに入る。

- 画像は、服だけが写る表と裏の切り抜きと、テクスチャ。人や部屋が写る元の写真は入れていない
- 採寸の写真が無いので、ダミーの服では採寸とテクスチャを作り直せない
- 裏面の写真は、裏面の切り抜きを白地に貼ったもの。apiは、裏面の写真が無い服のテクスチャを返さないため

前から使っているローカルDBに、データを消さずに足すときは、次を実行する。同じ服がすでにあれば、何もしない。

```bash
supabase seed buckets
docker exec -i supabase_db_pitari psql -U postgres < supabase/seed.sql
```

1行目は、画像をStorageに入れる。バケットの設定を上書きするかを聞かれたら、`Y`で進める。`config.toml`の設定はmigrationと同じなので、何も変わらない。2行目は、服の行をDBに入れる。

## モデルとUVテンプレートを受け取る

採寸とテクスチャ作成には、次のファイルが要る。

**HRNetの重みとUVテンプレートは、Gitに上げず、テクスチャ担当（GitHubの`runa64690`）が個人で渡す。** 重みは約244MBと大きく、配布元の利用条件もある。UVテンプレートは、Gitに入れていない元のモデル（`.blend`など）から作る。受け取ったら、フォルダの形を変えずに、リポジトリの次の場所に置く。

| 受け取るもの            | 置く場所                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| HRNetの学習済みの重み   | `apps/inference/models/pose_hrnet-w48_384x288-deepfashion2_mAP_0.7017.pth` |
| TシャツのUVテンプレート | `artifacts/uv/pitari/uv_template.json`と`artifacts/uv/pitari/masks/`       |
| 長そでのUVテンプレート  | `artifacts/uv/pitari/longsleeve/uv_template.json`と`longsleeve/masks/`     |
| シャツのUVテンプレート  | `artifacts/uv/pitari/shirt/uv_template.json`と`shirt/masks/`               |
| ズボンのUVテンプレート  | `artifacts/uv/pitari/trousers/uv_template.json`と`trousers/masks/`         |

- 重みは、HRNet公式のOneDriveから自分でダウンロードしてもよい（[推論サービスのREADME](../apps/inference/README.md)の「HRNetの重みをまだ置いていないPCで、手で入れる」）
- UVテンプレートは、種類ごとに`uv_template.json`と`masks/`を両方置く。無い種類は「テクスチャを作る」が503になる
- どれも`.gitignore`で外してあるので、置いてもcommitされない

ほかのモデルは、スクリプトで取る。先に推論サービスの仮想環境を作る（[推論サービスのREADME](../apps/inference/README.md)の「別の開発者が環境を作るとき」）。そのあと、リポジトリのルートで次を実行する。HRNetの実装（`apps/inference/models/hrnet-source/`）と、服の範囲を見つけるGrounding DINO（`apps/inference/models/grounding-dino-tiny/`、約660MB）が入る。

```powershell
./apps/inference/.venv/Scripts/python.exe apps/inference/prepare_models.py --detector
```

置いたら、推論サービスを起動する（[推論サービスのREADME](../apps/inference/README.md)の「起動」）。<http://localhost:3000/api/inference-status>の`weightsPresent`と`detectorPresent`が`true`なら、モデルを読み込める。

## 服の採寸を開発するとき

Pythonの推論サービスは、別に起動する。依存の分け方・モデルの置き方・画面の操作は、[推論サービスのREADME](../apps/inference/README.md)を見る。採寸画面は`http://localhost:3000/capture`。

mainを取り込んで新しいmigrationが入ったときは、上の「mainを取り込んだあと」の手順で当てる。

## スマホで撮影する

PCとスマホを、同じWi-Fiにつなぐ。PCでapi・Pythonの推論サービス・Supabaseを動かしたまま、webを同じネットワークから開けるように起動する。もう3000番でwebが動いていれば、そのwebだけを止めてから実行する。

```powershell
npx --yes pnpm@10.18.0 --filter @pitari/web exec next dev --hostname 0.0.0.0
```

PCで`ipconfig`を実行し、Wi-FiのIPv4アドレスを調べる。スマホのSafariかChromeで、`http://PCのIPv4アドレス:3000/capture`を開く。スマホでlocalhostを開くと、PCではなくスマホ自身につながってしまう。

PCのIPから開いた画面が動くように、`apps/web/next.config.ts`の`allowedDevOrigins`で、プライベートIPからの開発用の接続を許している。ページは出るのにボタンが効かないときや、読み込み中のまま止まるときは、PCのIPがこの範囲に入っているかを確かめる。ブランチを切り替えたあとなどに、画像やAPIだけが404になるときは、webの開発サーバーを起動し直す。

「写真を選ぶ・撮影」をタップすると、端末によって、背面のカメラか、撮り方を選ぶ画面が開く。撮ったら「寸法を測定」を押す。推論はPCで動くので、PCをスリープさせない。保存した画像もwebを通して取得するので、スマホからStorageのポートにつなぐ必要は無い。

画面が開かないときは、PCで同じURLを開けるかを確かめる。PCでだけ開けるときは、WindowsファイアウォールでTCPの3000番の受信を許しているかと、Wi-Fiが端末どうしの通信を止めていないかを確かめる。ファイアウォールを丸ごと切らない。受信を許すのは、信頼できるネットワークとローカルのサブネットだけにする。ログインがまだ無いので、ルーターのポートを開けたり、インターネットに公開したりしない。

今はfile入力で端末の撮影機能を使う。web画面の中にカメラの映像を埋め込むgetUserMedia方式は、まだ作っていない。この方式には原則としてHTTPSが要る。capture属性の動きは、OSとブラウザによって違う。

参考：[MDNのcapture属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)、[getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。

## commitの前に確かめること

lefthookが、stagedのファイルをPrettierで整形し、ESLintで調べる。mdは、Prettierの前にtextlintで、英語と日本語の間の空白を消す。手で`pnpm lint:md --fix`したときは、続けて`pnpm format`する。整形した結果は、自動でstagedに戻る。lintのエラーがあると、commitできない。

Pythonのファイルは、uvがあればruffで調べて整形する（[ADR 0022](adr/0022-python-lint-with-ruff.md)）。uvが無いときは飛ばすが、PRのCIで同じことを調べる。まだruffをかけていないディレクトリは、`ruff.toml`の`extend-exclude`にある。

いちばん先に、gitleaksで、stagedの変更に鍵やトークンなどの秘密が混ざっていないかを調べる（`scripts/check-secrets.sh`）。gitleaksが無ければDockerで動かし、どちらも無ければ飛ばす。PRのCIの`secrets`は、履歴をすべて調べる。

- 見つかったら、その変更をstagedから外す。秘密でないものを誤って見つけたときは、その行の末尾に`gitleaks:allow`と書く
- 秘密をpushしてしまったら、履歴から消すだけでは足りない。公開リポジトリなので、見られた前提で鍵を無効にして作り直す

## DBを変えるとき

1. `supabase migration new <変更の名前>`でmigrationを作り、SQLを書く
   - `profiles`を作るときは、`supabase/seed.sql`にデモユーザー（`apps/api/.env.example`の`DEMO_PROFILE_ID`）の行も入れる。`supabase db reset`のたびに流れる
   - 服のテーブルを変えるときは、`supabase/seed.sql`の[ダミーの服](#ダミーの服)の行も合わせる
2. `supabase db reset`でローカルのDBに反映する
3. `pnpm --filter @pitari/api db:types`で型（`apps/api/src/lib/database.types.ts`）を作り直し、commitする。CLIの版で型の書き方が変わるので、手元のCLIではなく、`npx`で決まった版を使う（[ADR 0029](adr/0029-commit-db-types.md)）
4. [docs/er.md](er.md)を更新する

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
