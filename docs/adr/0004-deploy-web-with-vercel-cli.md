# 0004 webはVercelに、手元のCLIからデプロイする

日付：2026-10-10

## 背景

スマホでPWAやカメラを試すにはHTTPSが要る（[0003](0003-pwa.md)）ので、早めにwebをデプロイしたい。

ただ、VercelをGitHubとつなぐには、VercelのGitHubアプリをjphacksのorgに入れる必要がある。入れられるのはorgのオーナー（JPHacks運営）だけで、チームの誰もorgのメンバーではない。また、VercelのLimitsのページには、Hobbyプランのプロジェクトはorgが持つリポジトリとはつなげない、とも書いてある。

## 決定

- web（`apps/web`）はVercelのHobbyプランに置く
- GitHubとはつながず、手元のMacからVercelのCLI（`npx vercel --prod`）でデプロイする。手順は[setup.md](../setup.md#webをvercelにデプロイする)
- リポジトリのルートに`.vercelignore`を置き、`.env`などの秘密のファイルを送らない
- Vercelでは、インストールのときにスクリプトを動かさない（`apps/web/vercel.json`の`installCommand`に`--ignore-scripts`）。CLIで送ったファイルには`.git`が無く、ルートの`prepare`（`lefthook install`）が失敗するため。依存のインストールスクリプトは、手元とCIでも`pnpm-workspace.yaml`で止めているので、動きは変わらない。インストールスクリプトが要る依存を足したら、この設定を見直す
- apiとSupabaseの置き場所は、DBと登録のAPIができてから決める

## 理由

- 運営の許可を待たずに、すぐHTTPSのURLでスマホで試せる
- Next.jsと同じ会社のサービスなので、設定がほぼ要らない（Root Directoryを`apps/web`にするだけ）
- 無料で使える

## 代替案

- 運営にVercelのGitHubアプリを入れてもらう：mainへのマージで自動でデプロイされ、PRごとにお試しのURLもできる。ただ、返事を待つ必要があり、入れてもらえてもHobbyではつなげない可能性がある
- GitHub ActionsからVercelのCLIでデプロイする：運営の許可なしで自動にできる。ただ、Vercelの鍵をリポジトリのsecretに置くことになり、書き込みできる全員がworkflow経由でその鍵を使える。自動にしたくなったら移る
- Vercel以外（Netlify、Cloudflare Pagesなど）：GitHubとつなぐなら、同じくorgへのアプリの追加が要る

## 影響

- デプロイは手で行う。mainにマージしても、本番は自動では更新されない
- デプロイできるのは、Vercelのプロジェクトを持つ人（今は93tajam）だけ。Hobbyプランには、ほかの人を入れられないため
- CLIは手元のファイルをそのまま送る。commitしていない変更も本番に載るので、mainの最新に切り替えてから出す
- お試しのURL（`--prod`なしで出したもの）は、Vercelにログインしないと見られない（Standard Protection）。スマホで試すときは本番のURLを使う
- 本番のURLは誰でも開ける。apiを出した後は、URLを知っている人が服の登録や削除をできるので、URLを広めない（[0002](0002-no-login-yet.md)）

## 参考文献

- [Vercel: Deploying Git Repositories with Vercel](https://vercel.com/docs/git)：Hobbyでのorgのリポジトリの扱い
- [Vercel: Limits](https://vercel.com/docs/limits)：「Connecting a project to a Git repository」
- [Vercel: Deployment Protection](https://vercel.com/docs/deployment-protection)：Standard Protectionは本番のドメイン以外を守る
- [Vercel: Build Features](https://vercel.com/docs/builds/build-features)：CLIが標準で送らないファイルの一覧（`.env`は入っていない）
- [Vercel: .vercelignore](https://vercel.com/docs/deployments/vercel-ignore)
