# 0004 webはVercelに、VercelのCLIでデプロイする

日付：2026-10-10（2026-10-17：手で出すのをやめ、mainへのマージで自動で出すように変えた）

## 背景

スマホでPWAやカメラを試すにはHTTPSが要る（[0003](0003-pwa.md)）ので、早めにwebをデプロイしたい。

ただ、VercelをGitHubとつなぐには、VercelのGitHubアプリをjphacksのorgに入れる必要がある。入れられるのはorgのオーナー（JPHacks運営）だけで、チームの誰もorgのメンバーではない。また、VercelのLimitsのページには、Hobbyプランのプロジェクトはorgが持つリポジトリとはつなげない、とも書いてある。

最初は手元のMacから手で出していたが、マージしても本番が古いままになりやすかった。

## 決定

- web（`apps/web`）はVercelのHobbyプランに置く
- GitHubとはつながず、VercelのCLIで出す。mainにマージすると、CIの`check`が通った後に、GitHub Actions（`.github/workflows/ci.yml`の`deploy`）が`vercel deploy --prod`で本番に出す。急ぐときは手元のMacからも出せる。手順は[setup.md](../setup.md#webをvercelにデプロイする)
- Actionsで使うVercelの鍵（`VERCEL_TOKEN`）と、プロジェクトのID（`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`）は、リポジトリのsecretに置く。鍵はpitariのプロジェクトだけに絞り、有効期限を付ける
- リポジトリのルートに`.vercelignore`を置き、`.env`などの秘密のファイルを送らない
- Vercelでは、インストールのときにスクリプトを動かさない（`apps/web/vercel.json`の`installCommand`に`--ignore-scripts`）。CLIで送ったファイルには`.git`が無く、ルートの`prepare`（`lefthook install`）が失敗するため。依存のインストールスクリプトは、手元とCIでも`pnpm-workspace.yaml`で止めているので、動きは変わらない。インストールスクリプトが要る依存を足したら、この設定を見直す
- apiとSupabaseの置き場所は、DBと登録のAPIができてから決める

## 理由

- 運営の許可を待たずに、HTTPSのURLでスマホで試せる
- Next.jsと同じ会社のサービスなので、設定がほぼ要らない（Root Directoryを`apps/web`にするだけ）
- 無料で使える
- マージするだけで本番が新しくなるので、出し忘れが無い。CIが落ちたコードは出ない

## 代替案

- 運営にVercelのGitHubアプリを入れてもらう：PRごとにお試しのURLもできる。ただ、返事を待つ必要があり、入れてもらえてもHobbyではつなげない可能性がある
- 手元のCLIだけで出す（最初はこうしていた）：鍵をsecretに置かずに済む。ただ、マージしても本番は更新されず、出せるのもVercelのプロジェクトを持つ人（93tajam）だけになる
- Actionsでbuildしてから、できたものだけを送る（`vercel build`と`vercel deploy --prebuilt`）：buildが1回で済む。ただ、Actionsにpnpmなどの準備が要り、手で出すときと動きが変わる
- Vercel以外（Netlify、Cloudflare Pagesなど）：GitHubとつなぐなら、同じくorgへのアプリの追加が要る

## 影響

- mainにマージすると、CIが通った数分後に本番が更新される
- buildは、CIの`check`とVercelの2回走る
- Vercelの鍵をsecretに置くので、リポジトリに書き込める人（チームの3人と運営）は、workflowを書き換えればその鍵を使える。鍵はプロジェクトに絞り、有効期限を付ける。ハッカソンが終わったら消す
- 手元から出すときは、CLIが手元のファイルをそのまま送る。commitしていない変更も本番に載るので、mainの最新に切り替えてから出す
- お試しのURL（`--prod`なしで出したもの）は、Vercelにログインしないと見られない（Standard Protection）。スマホで試すときは本番のURLを使う
- 本番のURLは誰でも開ける。apiを出した後は、URLを知っている人が服の登録や削除をできる（[0002](0002-no-login-yet.md)）

## 参考文献

- [Vercel: Deploying Git Repositories with Vercel](https://vercel.com/docs/git)：Hobbyでのorgのリポジトリの扱い
- [Vercel: Limits](https://vercel.com/docs/limits)：「Connecting a project to a Git repository」
- [Vercel: How can I use GitHub Actions with Vercel?](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)：`VERCEL_ORG_ID`と`VERCEL_PROJECT_ID`は`.vercel/project.json`にあり、鍵は`--token`で渡す
- [Vercel: Deployment Protection](https://vercel.com/docs/deployment-protection)：Standard Protectionは本番のドメイン以外を守る
- [Vercel: Build Features](https://vercel.com/docs/builds/build-features)：CLIが標準で送らないファイルの一覧（`.env`は入っていない）
- [Vercel: .vercelignore](https://vercel.com/docs/deployments/vercel-ignore)
