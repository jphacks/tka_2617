# Pitari

ネットで買う服って本当に自分に合うのかわからない！写真を撮るだけで服を測って、アバターに着せられるクローゼットアプリ。

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2026/07/IMG_5316.png)](https://www.youtube.com/watch?v=piaNsc6ilBI)

## 製品概要
### 背景(製品開発のきっかけ、課題等）
高校生のときは制服だったので、毎日の服を選ぶことも、自分で服を買うこともあまり無かった。高校を卒業すると、服は自分で選んで買うものになった。ネットで買えば手軽だが、届いて着てみるまで、自分に合うかは分からない。

服のサイズは、S・M・Lの表記だけでは分からない。同じMでも、ブランドや服によって着丈や身幅が違う。ネットの商品ページにはサイズ表の数字が載っている。ただ、その数字の服を自分が着たらどう見えるかは、想像しにくい。数字を比べる相手になるはずの手持ちの服も、実寸を測っている人は少ない。

自分で買う服が増えると、クローゼットの中身も覚えきれない。何を持っているかが分からないと、毎朝の服選びに迷い、似た服を買い足してしまう。

### 製品説明（具体的な製品の説明）
Pitariは、手持ちの服をスマホで撮って登録し、自分の体型の3Dアバターに、測った寸法どおりに着せて見られるクローゼットアプリ。スマホのブラウザで開き、ホーム画面に追加して使う（PWA）。今はTシャツ・長そで・シャツ・ズボンに対応している。

1. **撮って測る**：服をA4の紙と一緒に真上から撮る。PCで動く推論サービスが、服の範囲と、肩先や袖口などの要所の点（ランドマーク）を見つける。そして、A4の大きさを基準に、寸法をcmで出す。上の服は着丈・身幅・肩幅・袖丈、ズボンはウエスト・ヒップ・股下など。表と裏を撮ると、写真から服の柄（テクスチャ）を作る
2. **クローゼットにしまう**：登録した服を、写真と寸法つきで一覧する。種類で絞り込める。名前と寸法を直すことも、消すこともできる
3. **アバターに着せる**：アバター（男性・女性）に、性別・身長・体型（細身・標準・がっしり・ぽっちゃり）を登録する。そのアバターに、測った寸法どおりの形と、写真の柄で服を着せる。小さい服は「タイト」「小さすぎて着られません」と出す。シャツの下にTシャツを重ねた形も見られる
4. **今日の服を決める**：朝・昼・夜の気温と季節を出す。トップス・ボトムス・靴がそろうと、気温に合わせた組み合わせを毎朝提案する（提案は作っている途中）

### 特長
#### 1. A4の紙1枚で、メジャーを使わずに服の実寸を測る
服をA4の紙と一緒に撮るだけで、肩幅・袖丈・股下などがcmで出る。推論はPCのCPUで動く。GPUは要らず、写真を外のサービスに送ることもない（[ADR 0010](docs/adr/0010-local-garment-measurement.md)）。

#### 2. 自分の体型のアバターに、測った寸法どおりに着せる
服の寸法から3Dモデルの形を計算する。身長と体型を変えても、服は体に合わせて形を変える。服が体を突き抜けないように、外へ押し出す。袖が腕より長ければ垂らし、股下が長ければ裾を靴の上でたまらせる。小さすぎる服は、着られないと分かる。

#### 3. 自分の服の柄のまま着せる
表と裏の写真を、3Dモデルの型紙（UV）に合わせて貼る。無地の見本ではなく、自分の服の見た目で着せられる（[ADR 0015](docs/adr/0015-uv-template-for-photo-texture.md)）。

### 解決出来ること
* 手持ちの服の実寸が、写真と一緒にそろう。服を買うときに、サイズ表の数字を、よく着る手持ちの服と比べて選べる
* 服の組み合わせとサイズ感を、着替えずにアバターで確かめられる
* 持っている服を一覧できるので、似た服の買い足しや、毎朝の服選びに迷う時間を減らせる

### 今後の展望
* 気温・季節・色から、クローゼットの服でコーデを提案し、アバターに着せて見せる（[#113](https://github.com/jphacks/tka_2617/issues/113)）
* 着た服を記録の画面のカレンダーに残し、最近着た服を避けて提案する（[#114](https://github.com/jphacks/tka_2617/issues/114)）
* ZOZOTOWNの商品ページのURLから、サイズ表の寸法で服を足す。買う前に、自分の体型のアバターでサイズ感を確かめられる（[#111](https://github.com/jphacks/tka_2617/issues/111)）
* 骨格の設定を、アバターの形に反映する（[ADR 0043](docs/adr/0043-show-female-avatar-by-gender.md)）。腕を下ろすなどのポーズも足す
* ログインを入れ、服とアバターの設定を人ごとに分ける（[ADR 0002](docs/adr/0002-no-login-yet.md)）

### 注力したこと（こだわり等）
* **AIが書いても崩れない開発の仕組み**：3人ともAI（Claude Code、Codex）でコードを書く。AIが毎回読む指示（[AGENTS.md](AGENTS.md)）は短くした。守ってほしいことは、lintとCIで機械的に止めた。止まったときのメッセージには、「なぜ・代わりにどうするか」を日本語で書いた。AIはそれを読んで、自分で直せる
* **決めたことと理由を残す**：設計の判断を、30件を超えるADR（[docs/adr](docs/adr/README.md)）に残した。これで、AIが前提を知らずに作りを変えてしまうのを防いだ
* **ログインが無くても、DBの鍵をブラウザに出さない**：画面（Next.js）と、DBに触れるapi（Hono）を分け、鍵はapiだけが持つ（[ADR 0001](docs/adr/0001-separate-web-and-api.md)）。webはapiの型をHono RPCでそのまま使うので、分けても型はずれない

| いつ | 何で止めるか |
| --- | --- |
| commitの前（lefthook） | gitleaks（鍵やトークンの混入）、Prettier、ESLint、textlint（英語と日本語の間の空白）、ruff（Python） |
| PRのCI | 上に加えて、型、テスト、build、knip（使っていないコードと依存）、actionlint（workflowの書き間違い）、gitleaks（履歴すべて）。DBに関係するファイルを変えたPRでは、migrationとDBの型も確かめる。PRの行数（400行超）と、テストの無い処理の変更は、警告だけにして落とさない |
| マージの後 | mainへのマージで本番に自動で出す。開発用のページは本番では404 |
| AIの権限 | Claude Codeは、force push、フックを飛ばすcommit、クラウドのDBへの反映、`.env`の読み取りを止める（[.claude/settings.json](.claude/settings.json)）。Codexは、force push、フックを飛ばすcommit、クラウドのDBへの反映を止める。pushと依存の追加は確認する。Codexのルールはコマンドの先頭一致なので、`git push origin --force`のように途中にフラグがある形は止められない。その形は、pushの確認に回る（[.codex/rules/project.rules](.codex/rules/project.rules)） |

## 開発技術
### 活用した技術
#### API・データ
* [DeepFashion2](https://github.com/switchablenorms/DeepFashion2)：服のランドマークのデータセット。これで学習した[HRNet](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch)の重みで、服の要所の点を見つける
* [Grounding DINO](https://huggingface.co/IDEA-Research/grounding-dino-tiny)（tiny）：写真の中の服の範囲を見つける
* [Open-Meteo](https://open-meteo.com/)：今日の朝・昼・夜の気温（[ADR 0040](docs/adr/0040-today-weather-and-season.md)）
* [Supabase](https://supabase.com/)：服のデータ（PostgreSQL）と、写真・テクスチャ（Storage）
* MakeHumanの素材（CC0）：アバターの体、服、髪、靴の元（[ライセンス](apps/web/public/presets/LICENSES.md)）

#### フレームワーク・ライブラリ・モジュール
* 画面：Next.js 16（App Router）、React 19、Tailwind CSS 4
* 3D：three.js、React Three Fiber、drei、three-mesh-bvh（服を押し出すときに、近い体の面を探す）
* API：Hono（Hono RPCで型をwebへ渡す）、zod、supabase-js
* 推論：Python、FastAPI、PyTorch、Transformers、OpenCV（A4の検出、GrabCutでの切り抜き）
* 3Dモデルづくり：Blender（Pythonのスクリプトで書き出す）、MPFB2
* 開発と運用：pnpm、Vercel、GitHub Actions、CodeRabbit、Claude Code、Codex

#### デバイス
* スマートフォン（iPhone・Android）：撮影と、すべての画面。ホーム画面に追加して使う
* PC：api、DB、推論サービスを動かす。推論はCPUだけで動く
* A4の紙：採寸の縮尺の基準

### 独自技術
#### ハッカソンで開発した独自機能・技術
* **AIの誤りを止める独自のlintのルール**：次のような書き方を止める（[apps/web/eslint.config.mjs](apps/web/eslint.config.mjs)、[apps/api/eslint.config.mjs](apps/api/eslint.config.mjs)）
  * サーバー専用のファイルに、`import "server-only"`を書き忘れる
  * 秘密に見える名前の環境変数を、`NEXT_PUBLIC_`にする
  * 画面から、外部のURLを直接呼ぶ
  * Honoのルートを別の文で足し、webから型が見えなくなる
* **Blenderが書き出した3Dの表を、webのテストで確かめる**：服の表（身長・体型ごとのシェイプキーの効き方）を、テストで実際に読む。4体型×4身長で、「寸法からキーを解き、キーから寸法を作り直すと元に戻るか」を確かめる。ズボンでは、写真の寸法が矛盾しても、キーの値が暴れないことを確かめる。抑えないとキーの値は284まで大きくなり、抑えると15.8に収まる（[apps/web/tests/](apps/web/tests/)）
* **PRの大きさの警告**：PRの行数を数え、400行を超えたら警告する。ロックファイルやBlenderの書き出しなどの生成物は、印を付けて数えない（[.gitattributes](.gitattributes)）。テストも数えない。警告するのは、AIが作るPRが大きくなりやすいため。テストを除くのは、数えるとテストを書かなくなるため（[scripts/pr-size.sh](scripts/pr-size.sh)）
* **テストの書き忘れの警告**：処理（apiの`src/services`・`src/lib`、webの`src/lib`）を変えたのに、同じアプリの`tests/`が変わっていないPRでは、変えたファイルに警告を付ける。AIに処理を書かせても、テストは一緒に作られなかったため（[scripts/pr-tests.sh](scripts/pr-tests.sh)）
* **migrationを空のDBで確かめる**：DBに関係するファイルを変えたPRと、mainへのマージのときに、SupabaseのDBを空の状態で起動する。migrationとseedが最後まで通るか、DBの関数に誤りが無いか、commitしたDBの型がmigrationと合っているかを確かめる（[.github/workflows/db.yml](.github/workflows/db.yml)）
* **服の実寸どおりの形を、スマホの中で作る**：着丈・身幅・肩幅・袖丈のcmから、服のシェイプキーの値を解く。キー同士の連動と、体型・身長による効き方の違いは、表を補間して吸収する。表は、Blenderで4体型×5身長ごとに測ったもの（[ADR 0008](docs/adr/0008-height-keys-and-tables.md)、[apps/web/src/lib/garment.ts](apps/web/src/lib/garment.ts)）
* **骨格を使わず、体型・身長を体と服・髪・靴の共通のシェイプキーで変える**：服・髪・靴は、MakeHumanの服を体に沿わせる仕組み（mhclo）で、体型・身長ごとに着せ直す。こうして、体と同じ名前のキーを持たせる。ブラウザでは、体と同じ値を入れるだけで体に合う（[ADR 0017](docs/adr/0017-presets-follow-body-with-shape-keys.md)）
* **服が体を突き抜けない押し出し**：体の面をthree-mesh-bvhで探し、近すぎる服の頂点を外へ出す。服で覆われるはずの体が出ていれば、面を足して押す。縁はならす。スマホで約0.27秒かかる。シャツの下にTシャツを着たときも同じ仕組みで、Tシャツの面に沿ってシャツを押し出す（[ADR 0007](docs/adr/0007-push-shirt-out-only.md)、[apps/web/src/lib/push-out.ts](apps/web/src/lib/push-out.ts)）
* **着られるかを寸法で判定する**：服の身幅を、同じ高さで切った体の一周の半分と比べる。そして、「タイト」「小さすぎて着られません」と出す。シャツの下にTシャツを着たときは、外の服を、体にTシャツ1枚分の厚みを足した大きさと比べる（[ADR 0007](docs/adr/0007-push-shirt-out-only.md)、[ADR 0032](docs/adr/0032-layered-fit-status.md)）
* **余った袖と裾の形**：袖丈が腕より長いと、Blenderの布のシミュレーションで作った、垂れた形を混ぜる。股下が長いと、裾を靴の甲の上でたまらせる（[apps/web/src/lib/sleeve-drape.ts](apps/web/src/lib/sleeve-drape.ts)、[apps/web/src/lib/hem-stack.ts](apps/web/src/lib/hem-stack.ts)）

## ローカルの環境構築

必要なもの：Node.js 22、pnpm 10.18.0、Docker Desktop、Supabase CLI。Docker Desktopを起動して、リポジトリのルートで実行する。

```bash
pnpm install
supabase start
```

初回だけ、環境変数ファイルを作る。すでにある場合はコピーせず、そのまま使う。

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

- `apps/api/.env`の`SUPABASE_SECRET_KEY`に、`supabase status -o env`で出る`SECRET_KEY`を入れる（古いCLIでは`SERVICE_ROLE_KEY`）。
- `openssl rand -hex 32`でトークンを作り、両方のファイルの`INTERNAL_API_TOKEN`に同じ値を入れる。
- `.env`類や秘密の値はcommitしない。

```bash
pnpm dev
```

画面は<http://localhost:3000>、apiは<http://localhost:3001>。<http://localhost:3000/api/health>が`{"ok":true}`を返せば、webからapiにつながっている。

Dockerを使うのは、ローカルのSupabaseだけ。`supabase start`のあと、Docker Desktopにコンテナが出る。webとapiは、`pnpm dev`で直接起動する。

止めるときは、webとapiは`pnpm dev`のターミナルで`Ctrl+C`、Supabaseは`supabase stop`。mainを取り込んだあとの準備（依存・migration・推論サービスの起動し直し）と、ブラウザで確かめることは、[セットアップの「mainを取り込んだあと」](docs/setup.md#mainを取り込んだあと)にある。DBを変えるときとデプロイの手順も、[セットアップ](docs/setup.md)にある。
