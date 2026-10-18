# ローカル採寸サービス

webやapiとは別の、Pythonの仮想環境で動く。DBとStorageにはつながず、Honoから受け取った写真について、縮尺・ランドマーク・透過画像を返す。表と裏の写真からは、服ごとのテクスチャをPCの中のフォルダに作る（下の「服ごとのテクスチャ」）。写真全体の遠近の補正はしない。まずCPUで試し、学習済みのモデルで実際に測ってから、GPUが要るかを決める。

## このPCで準備してあるもの

- `apps/inference/.venv/`のPythonの依存。PC全体のPythonは変えていない。
- `models/hrnet-source/`の、公式のHRNetの実装。ソースだけでは、自動で採寸できない。
- `models/grounding-dino-tiny/`の、服の種類と範囲を見つけるモデル。
- DeepFashion2用の、HRNetの学習済みの重み。このPCでは置いてあり、読み込めることも確かめた。
- A4の紙からの縮尺の計算、元の測定画像への座標の戻し、ドラッグでの調整、GrabCutでの背景の透過。

## HRNetの重みをまだ置いていないPCで、手で入れる

このPCには下の重みが置いてあるので、ダウンロードし直さなくてよい。ほかのPCでは、テクスチャ担当（GitHubの`runa64690`）から個人で受け取ってもよい（[セットアップ](../../docs/setup.md)の「モデルとUVテンプレートを受け取る」）。

1. [HRNet公式READMEのOneDriveのリンク](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch#onedrive-cloud-storage)を開く。
2. DeepFashion2用の次のファイルをダウンロードする。人の姿勢を推定する別のモデルとは、互換性が無い。

   ```text
   pose_hrnet-w48_384x288-deepfashion2_mAP_0.7017.pth
   ```

3. ファイル名を変えずに、次の場所へ置く。

   ```text
   apps/inference/models/pose_hrnet-w48_384x288-deepfashion2_mAP_0.7017.pth
   ```

配布先でログインやアクセスの許可を求められたら、その案内に従う。リンクが使えなければ、配布元に問い合わせる。推論を試すだけなら、DeepFashion2の学習用の画像を全部そろえる必要は無い。モデルとデータの利用条件は、配布元で確かめる。重みが無い間も、結果の画面で寸法を数字で入力できる。

## 別の開発者が環境を作るとき

次のコマンドは、リポジトリのルートで、PowerShellから実行する。このPCでは、仮想環境の作成と依存のインストールが済んでいるので、繰り返さなくてよい。

```powershell
py -3.11 -m venv apps/inference/.venv
./apps/inference/.venv/Scripts/python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
./apps/inference/.venv/Scripts/python.exe -m pip install -r apps/inference/requirements.txt
./apps/inference/.venv/Scripts/python.exe apps/inference/prepare_models.py
```

`requirements-windows-cpu.lock.txt`には、このPCでインストールしたバージョンを書いてある。同じWindowsとPythonで同じ環境を作るときは、CPU版のindexを指定して、このファイルを使う。ほかのOSやGPUの環境では、そのまま使わない。

```powershell
./apps/inference/.venv/Scripts/python.exe -m pip install -r apps/inference/requirements-windows-cpu.lock.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

服の種類と範囲まで自動で見つけるには、Grounding DINOのモデルも用意する。無くても動く。

```powershell
./apps/inference/.venv/Scripts/python.exe apps/inference/prepare_models.py --detector
```

置いていないときは、画面で服の種類を選び、服を囲む範囲を指定する。HRNetは、服の範囲の中でランドマークを見つけるモデル。

## 起動

webとapiとローカルのSupabaseは、[セットアップ](../../docs/setup.md)を見る。推論用には、`apps/inference/.env.example`から`.env`を作り、32文字以上のランダムな`INFERENCE_TOKEN`を入れる。同じ値を`apps/api/.env`にも足す。今ある環境のファイルは上書きしない。

```powershell
# リポジトリのルートから、専用のターミナルで実行する
./apps/inference/.venv/Scripts/python.exe apps/inference/run.py
```

推論サービスは`127.0.0.1:8001`で起動する。webの`http://localhost:3000/capture`で写真を選び、「寸法を測定」を押す。最初の推論は、モデルの読み込みにも時間がかかる。

このPCでは、ローカルのSupabase用の`apps/api/.env`と`apps/web/.env.local`、推論用の`apps/inference/.env`も作ってある。トークンはほかの人に配らず、それぞれのPCで作る。

このPCでサーバーを止めたあとに起動し直すときは、Docker Desktopを起動してから、リポジトリのルートのターミナルで次を実行する。もう起動しているなら、重ねて実行しない。

```powershell
npx --yes supabase start
npx --yes pnpm@10.18.0 dev
```

別のターミナルで、上のPythonの推論サービスを起動する。

## 操作

1. 服1着と、折れていないA4の紙を同じ平面に置き、服の全体と紙の四隅を撮る。
2. 「寸法を測定」を押す。A4→服の種類と範囲→ランドマーク→背景の切り抜き、の順に処理する。
3. 進み具合の目安を、1%刻みで出す。工程の切り替わりと経過時間から出すもので、残り時間の割合ではない。
4. 結果の「寸法」では、袖丈などの測った区間を、名前の付いた両端の矢印で確かめる。服の点や番号は出さない。「A4」と「服の範囲」では、調整点をドラッグできる。
5. 見つけられなかったときは、服の種類を選び、範囲の対角の2点と、A4の外周の4点を指定する。寸法は数字でも入力できる。服のランドマークを直接動かす操作は作らない。
6. 切り抜きのプレビューと寸法を確かめ、クローゼットに登録する。保存したあとも、名前と寸法を直せる。

紙の四隅の候補は、自動で使う。紙ではない長方形を拾ったときは、結果の画面で直す。しわ・厚み・隠れた縫い目は補正できない。寸法は推定値なので、最初はメジャーで測った値と比べる必要がある。背景と服が似た色だと、切り抜きを間違えることがある。

## 服ごとのテクスチャ

Tシャツ・長そで・ズボンのどれでも、裏面を保存すると、apiが表のmeasurement画像と裏面を`POST /textures`へ送る（multipartの`garmentId`・`category`・`front`・`back`、Bearer認証）。服の詳細の「テクスチャを作る」から、保存した写真で作り直せる。推論サービスは受け付けたらすぐ202を返し、裏のスレッドで1件ずつ作る。できたものは、次のPCの中のフォルダに書き出す。CPUで1〜数分かかる。

```text
apps/inference/textures/{生成日時}_{種類}_{服ID先頭8文字}/
例：apps/inference/textures/2026-10-17_11-01-58_長そで_d6156da4/
```

フォルダは1つの階層に並ぶ。名前の順に並べると作った順になり、いちばん下が最新。

| ファイル                                                    | 見るところ                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `job.json`                                                  | `status`（running・done・failed）、失敗の理由、塗れた割合、かかった時間 |
| `{フォルダと同じ名前}.png`                                  | 確認と受け渡しのためのテクスチャ（2048×2048）                           |
| `texture.png`                                               | 同じ画像。今あるBlenderの確認スクリプトのために、決まった名前でも残す   |
| `debug_photo_front.jpg`・`debug_photo_back.jpg`             | 推論の点・服の輪郭・三角形。ずれていないかを、まずここで見る            |
| `debug_texture_coverage.png`・`report.json`                 | 補った所・信頼度が低い所・塗れなかった所と、警告                        |
| `input_*.jpg`・`photo_*.jpg`・`points_*.json`・`mask_*.png` | 受け取った写真と、使った点・服の領域。手で直して作り直すときに使う      |

できたテクスチャは、apiが次の2つで受け取り、Storageに置いてアバターに配る（[ADR 0033](../../docs/adr/0033-serve-texture-through-api.md)）。待っている服と作っている最中の服には、フォルダにある前の作業ではなく、`queued`・`running`を返す。

- `GET /textures/{服ID}`：最新の作業の状態と、`job.json`の`backImageId`
- `GET /textures/{服ID}/{作業フォルダ名}/texture.png`：テクスチャの画像

服IDは、クローゼットの詳細の画面のURL（`/garments/{服ID}`）で分かる。作るたびに新しい日時のフォルダができ、前の結果も残る。同じ服を同じ秒に作り直したときは、名前の最後に`_2`などを付ける。服を消しても、このフォルダは消えない。点や服の領域を直して作り直す手順と、3Dモデルで見る手順は、[UVテンプレートのREADME](../../artifacts/uv/pitari/README.md)の「写真で試す」と同じ。

アプリでは、撮影の画面で表の写真を入れ、種類を「パンツ」にして裏面も足し、「クローゼットに登録」を押す。あとから裏面を足すときは、服の詳細から登録する。作る依頼が失敗したときは、推論サービスの設定と起動、UVテンプレートを確かめ、詳細の「テクスチャを作る」でやり直す。受け付けられても、できあがったとは限らない。`job.json`が`done`になってから、`texture.png`を確かめる。

2026-10-15に、受け取ったズボン用のバージョン2のテンプレートで、実際のジーンズの表と裏の写真を、サービスと同じ`texture.make`へ渡した。自動の推論から、`job.json: done`と、2048×2048のテクスチャの保存までを確かめた（約163秒）。塗り残しは0、裏返った三角形も0だった。手で直したマスクは渡していないので、写真の床や影が入っていないかは、目で確かめる必要がある。

- 変換の本体は`artifacts/uv/pitari/scripts/photo_to_texture.py`の`make_texture`。服の種類でテンプレートを選ぶ。Tシャツは`artifacts/uv/pitari/uv_template.json`、長そでは`artifacts/uv/pitari/longsleeve/uv_template.json`、シャツは`artifacts/uv/pitari/shirt/uv_template.json`、ズボンは`artifacts/uv/pitari/trousers/uv_template.json`（どれもGitに含まれない）。シャツの写真は、検出・点・切り抜きを長そでとして扱う。テンプレートが無いPCでは503を返し、テクスチャは作らない。作り方は[UVテンプレートのREADME](../../artifacts/uv/pitari/README.md)。
- ズボンの切り抜きと服の領域は、ランドマークで囲んだ輪郭の外を背景として教えて作る（`pitari/cutout.py`の`garment_alpha`、[ADR 0024](../../docs/adr/0024-trousers-cutout-with-landmarks.md)）。テクスチャを作るときも同じ関数を使う。
- モデルは採寸と同じものを使う。テクスチャを作るのにモデルを使っている間は、採寸のリクエストが最大60秒待ってから処理される。
- 待っている作業は5件まで。同じ服の作業が待っている間に新しい写真が届いたら、新しいほうに置き換える。

## 長そでの登録

`long_sleeve_top`を、検出・採寸・切り抜き・テクスチャの作成で受け付ける。長そでの点は33個で、入力する寸法はTシャツと同じ着丈・身幅・肩幅・袖丈。今のHRNetの重みを使うので、モデルを新しく取ってくる必要は無い。撮影の画面では、測る前に服の種類を選び、選んだ種類で検出する。シャツは、推論サービスには長そでとして届く。

DBには`supabase/migrations/20261017000100_long_sleeve_top.sql`を当てる必要がある。ローカルのDBを起動して、`supabase migration up --local`を実行する。クラウドには、この変更では当てない。

長そでのテクスチャは、[受け取った素材のREADME](../../artifacts/uv/pitari/inputs/longsleeve/README.md)の手順でテンプレートを用意する。表を登録し、詳細で裏面を登録すると、作る依頼が出る。「テクスチャを作る」からやり直せる。結果は、ほかの種類と同じく`textures/{生成日時}_長そで_{服ID先頭8文字}/`に保存する。

## テクスチャのファイル名

フォルダと確認用の画像の名前は`{生成日時}_{種類}_{服ID先頭8文字}`。例は`2026-10-17_11-01-58_長そで_d6156da4.png`。生成日時は変換を始めた日本時間で、`年-月-日_時-分-秒`の順。処理が終わった時刻は`job.json`の`completedAt`で、服をクローゼットに登録した時刻は`garmentCreatedAt`で分かる。古い履歴など、登録した時刻が分からないときは、`garmentCreatedAt`は`null`になる。

確認用の画像の名前は、`job.json`の`textureFile`に書く。作るのに失敗したフォルダには、できあがった画像が無い。最新の画像を探すときは、下から順に見て、`.png`のあるフォルダを選ぶ。今ある`texture.png`は、Blenderの確認スクリプトで使えるように残す。[名前の付け方を決めたADR](../../docs/adr/0031-texture-filenames-with-dates.md)も見る。

## 検証

```powershell
cd apps/inference
./.venv/Scripts/python.exe -m unittest discover -s tests -v
```

実際の推論の速さは、重みを置いたあと、JPEGと服の範囲を指定して測る。

```powershell
./.venv/Scripts/python.exe benchmark.py --help
```

学習済みの重みが無ければ、ベンチマークは止まる。ランダムな重みでの時間を、実際の性能として報告しない。

web・api・推論・ローカルのSupabaseを起動したあと、リポジトリのルートで次の結合テストも実行できる。合成画像で、次のことを確かめる。テストで作った服だけを、最後に消す。実際の服での精度を確かめるものではない。

- JPEGが変わらないこと
- A4からの自動の縮尺
- 切り抜きの透明度
- 採寸・登録・取得・更新・削除

```powershell
./apps/inference/.venv/Scripts/python.exe apps/inference/smoke_local.py
```

## チームへの影響を抑える

仮想環境・モデル・キャッシュ・`.env`は、Gitで管理しない。webとapiのJavaScriptの依存は足していない。ほかの担当者は、Pythonを起動しなくても今の画面を開発できる。推論を使わないapiでは、`INFERENCE_TOKEN`を入れなくてよい。DBの変更はmigrationで共有し、クラウドには自動で当てない。OneDriveの同期から外す設定は、Gitの除外とは別のもの。大きいモデルを同期したくないときは、OneDrive側の設定も考える。

## 確かめた範囲（2026-10-10）

- Pythonの座標・縮尺・背景の透過・工程ごとの処理の11件と、TypeScriptの採寸・認証・PNGの検証の9件が通った。
- lint・型チェック・本番のビルド・変えたファイルの整形チェックが通った。
- ローカルのSupabaseに、最初のmigrationと、透過画像のために足したmigrationを当てた。
- BFFを通して、写真のバイト列が変わらないこと、A4からの自動の縮尺、透過PNGの保存と署名URLの取得、寸法の更新と削除まで通った。結合テストで作った服は消した。
- Grounding DINOを読み込み、合成画像で動くことを確かめた。実際の服での分類の精度は、まだ測っていない。
- HRNetの学習済みの重みをCPUで読み込み、合成画像での推論まで通った。実際の写真でのランドマークの精度と処理時間は、まだ確かめていない。
- 学習済みのモデルでの一括の処理は、合成画像で初回が約32.5秒。種類・ランドマーク・切り抜きは返ったが、パンツに似せた図形がTシャツに分類された。なので、精度を確かめられたとは扱わない。写真での速さと精度を、あとで評価する必要がある。
- ブラウザにつなげなかったので、画面はHTMLの応答までしか確かめていない。クリック・見た目・スマホでの撮影は、まだ確かめていない。

## 参考文献

- [DeepFashion2](https://github.com/switchablenorms/DeepFashion2)
- [HRNet公式実装](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch)
