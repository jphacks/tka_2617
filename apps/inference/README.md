# ローカル採寸サービス

既存のweb・apiとは別のPython仮想環境で動く。DBとStorageには接続せず、Honoから受け取った写真の縮尺・ランドマーク・透過画像を返す。表と裏の写真からは、服ごとのテクスチャをPC内のフォルダに作る（下の「服ごとのテクスチャ」）。写真全体への遠近補正は行わない。まずCPUで試し、学習済みモデルでの実測を見てからGPUの必要性を判断する。

## このPCで準備済みのもの

- `apps/inference/.venv/`のPython依存。グローバルPythonは変更していない。
- `models/hrnet-source/`の公式HRNet実装。ソースだけでは自動採寸はできない。
- `models/grounding-dino-tiny/`の服のカテゴリ・範囲検出用モデル。
- DeepFashion2用HRNetの学習済み重み。このPCでは配置・読み込み済み。
- A4からの縮尺算出、元の測定画像への座標復元、ドラッグ調整、GrabCutによる背景透過。

## HRNetを未配置のPCで行う手動ダウンロード

このPCでは以下の重みがすでに配置されているため、追加ダウンロードは不要。

1. [HRNet公式READMEのOneDriveリンク](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch#onedrive-cloud-storage)を開く。
2. DeepFashion2用の次のファイルをダウンロードする。別の人体姿勢推定用モデルとは互換性がない。

   ```text
   pose_hrnet-w48_384x288-deepfashion2_mAP_0.7017.pth
   ```

3. ファイル名を変えず、次の位置へ置く。

   ```text
   apps/inference/models/pose_hrnet-w48_384x288-deepfashion2_mAP_0.7017.pth
   ```

配布先でログイン・アクセス許可が求められた場合は、その案内に従う。リンクが使えなければ配布元への確認が必要。推論を試すだけならDeepFashion2の学習用画像全体は不要。モデル・データの利用条件は配布元で確認する。重みがない間も、結果画面で寸法を数値入力できる。

## 別の開発者が環境を作るとき

以下はリポジトリ直下のPowerShellで実行する。このPCでは仮想環境の作成と依存インストールは完了しているため、繰り返す必要はない。

```powershell
py -3.11 -m venv apps/inference/.venv
./apps/inference/.venv/Scripts/python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
./apps/inference/.venv/Scripts/python.exe -m pip install -r apps/inference/requirements.txt
./apps/inference/.venv/Scripts/python.exe apps/inference/prepare_models.py
```

`requirements-windows-cpu.lock.txt`にはこのPCでインストールしたバージョンを記録した。同じWindows・Pythonで再現する場合は、CPU版のindexを指定してこのファイルを使う。別OSやGPU環境ではそのまま流用しない。

```powershell
./apps/inference/.venv/Scripts/python.exe -m pip install -r apps/inference/requirements-windows-cpu.lock.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

服のカテゴリと範囲まで自動検出するには、任意のGrounding DINOモデルも準備する。

```powershell
./apps/inference/.venv/Scripts/python.exe apps/inference/prepare_models.py --detector
```

未配置なら画面でカテゴリと服を囲む範囲を指定する。HRNet自体は服の範囲内のランドマークを求めるモデル。

モデルをそろえたら、OpenVINOの形式に変換しておく（[ADR 0049](../../docs/adr/0049-openvino-for-models.md)）。変換に10分ほどかかり、`models/openvino/`に約0.8GB置く。変換したものがあれば推論サービスはそちらを使い、服の検出が1枚約23秒から約6秒、ランドマークが約1.8秒から約0.9秒になる（このPCのCPU）。なければ今までどおりPyTorchで動かす。モデルやOpenVINOを入れ替えたら、`models/openvino/`を消してから変換し直す。

```powershell
./apps/inference/.venv/Scripts/python.exe apps/inference/prepare_models.py --openvino
```

テクスチャの三角形の貼り付けは、Rust拡張`pitari_fast`（`apps/inference/native/`）があれば使う（[ADR 0050](../../docs/adr/0050-rust-for-texture-warp.md)）。1面約0.6秒が約0.2秒になり、結果はPython版と同じ。なければPython版で動く。ビルドにはRust（[rustup](https://rustup.rs/)）とVisual StudioのC++ビルドツールが要る。パスに日本語があるとmaturinがpipの出力を読めないため、`PYTHONUTF8`を付ける。

```powershell
cd apps/inference/native
../.venv/Scripts/python.exe -m pip install maturin==1.15.0
$env:PYTHONUTF8 = "1"; $env:VIRTUAL_ENV = (Resolve-Path ../.venv).Path
../.venv/Scripts/maturin.exe develop --release
```

## 起動

通常のweb・api・ローカルSupabaseは[セットアップ](../../docs/setup.md)を参照。推論用には`apps/inference/.env.example`から`.env`を作り、32文字以上のランダムな`INFERENCE_TOKEN`を設定する。同じ値を`apps/api/.env`にも追加する。既存の環境ファイルは上書きしない。

```powershell
# リポジトリ直下から、専用のターミナルで実行する
./apps/inference/.venv/Scripts/python.exe apps/inference/run.py
```

推論サービスは`127.0.0.1:8001`で起動する。webの`http://localhost:3000/capture`で写真を選び、「寸法を測定」を押す。最初の推論はモデル読み込み時間もかかる。

このPCではローカルSupabase用の`apps/api/.env`、`apps/web/.env.local`、推論用の`apps/inference/.env`も作成済み。トークンは他の人に配布せず、各自の環境で作る。

このPCでサーバーを停止後に再起動する場合は、Docker Desktopを起動してから、リポジトリ直下のターミナルで次を実行する。すでに起動中なら重複して実行しない。

```powershell
npx --yes supabase start
npx --yes pnpm@10.18.0 dev
```

別のターミナルで、上記のPython推論サービスを起動する。

## 操作

1. 服1着と折れていないA4用紙を同じ平面に置き、服全体と紙の四隅を撮影する。
2. 「寸法を測定」を押す。A4→服の種類・範囲→ランドマーク→背景切り抜きを順に実行する。
3. 工程の切り替わりと経過時間から、進み具合の目安を1%刻みで表示する。残り時間の割合ではない。
4. 結果の「寸法」で、袖丈などの測定区間を名前付きの両端矢印で確認する。服の点や番号は表示しない。「A4」「服の範囲」では調整点をドラッグできる。
5. 認識できなかったときはカテゴリ選択・範囲の対角2点・A4の外周4点を指定する。寸法は数値入力でも補える。服のランドマークを直接編集する操作は用意しない。
6. 切り抜きプレビューと寸法を確認し、クローゼットへ登録する。保存後は名前・寸法を編集できる。

四隅候補は自動で使用するが、用紙以外の長方形を拾う場合は結果上で修正する。しわ・厚み・隠れた縫い目は補正できない。採寸値は推定値であり、最初はメジャーとの比較が必要。切り抜きは背景と服が同系色の場合に誤ることがある。

## 服ごとのテクスチャ

Tシャツ・長そで・ズボンのいずれも、裏面を保存すると、apiが表のmeasurement画像と裏面を`POST /textures`（multipartの`garmentId`・`category`・`front`・`back`・`frontSaved`、Bearer認証）へ送る。`frontSaved`は採寸画面で保存した表の点とA4の四隅で、推論の結果より優先して使う（[ADR 0051](../../docs/adr/0051-saved-points-for-texture.md)）。服の詳細の「テクスチャを作る」から保存済み写真で再生成できる。推論サービスは受け付けたらすぐ202を返し、裏の作業スレッドで1件ずつ作る。生成物は次のPC内のフォルダに書き出す。採寸・裏面の登録で切り抜いた写真なら数秒、推論し直す写真ならCPUで約1分かかる。

```text
apps/inference/textures/{生成日時}_{種類}_{服ID先頭8文字}/
例：apps/inference/textures/2026-10-17_11-01-58_長そで_d6156da4/
```

フォルダは1階層に並び、名前順に並べると生成順になる。最新は一番下のフォルダ。

| ファイル                                                    | 見るところ                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `job.json`                                                  | `status`（running・done・failed）、失敗の理由、塗れた割合、かかった時間    |
| `{フォルダと同じ名前}.png`                                   | 確認・受け渡し用のテクスチャ（2048×2048）                                  |
| `texture.png`                                               | 同じ画像。既存のBlender確認スクリプト向けに固定名も保持する                   |
| `debug_photo_front.jpg`・`debug_photo_back.jpg`             | 推論の点・服の輪郭・三角形。ずれていないかをまず見る                        |
| `debug_texture_coverage.png`・`report.json`                 | 補った所・信頼度が低い所・塗れなかった所と、警告                            |
| `input_*.jpg`・`photo_*.jpg`・`points_*.json`・`mask_*.png` | 受け取った写真と、使った点・服の領域。手で直して作り直すときに使う          |

完成したテクスチャは、apiが`GET /textures/{服ID}`（最新の作業の状態と`job.json`の`backImageId`）と`GET /textures/{服ID}/{作業フォルダ名}/texture.png`で受け取り、Storageに置いてアバターへ配る（[ADR 0033](../../docs/adr/0033-serve-texture-through-api.md)）。待ち・作業中の服は、フォルダの前の作業ではなく`queued`・`running`を返す。

服IDはクローゼットの詳細画面のURL（`/garments/{服ID}`）で分かる。生成のたびに新しい日時のフォルダができ、前の結果は残る。同じ服を同じ秒に作り直した場合は末尾に`_2`などを付ける。服を削除してもこのフォルダは消えない。点や服の領域を直して作り直す手順と、3Dモデルで見る手順は[UVテンプレートのREADME](../../artifacts/uv/pitari/README.md)の「写真で試す」と同じ。

アプリでは、撮影画面で表の写真を入れ、カテゴリを「パンツ」にして裏面も追加し、「クローゼットに登録」を押す。あとから裏面を加える場合は、服の詳細から登録する。生成依頼に失敗した場合は推論サービスの設定・起動とUVテンプレートを確認し、詳細の「テクスチャを作る」で再試行する。受付成功は完成を意味しない。`job.json`が`done`になったら`texture.png`を確認する。

2026-10-15に、受領したズボン用のバージョン2テンプレートで、実際のジーンズの表裏写真をサービスと同じ`texture.make`へ渡し、自動推論から`job.json: done`と2048×2048のテクスチャの保存まで確認した（約163秒）。塗り残し0、反転した三角形0。手修正したマスクは渡していないため、写真の床や影の混入は目視確認が必要。

- 変換の本体は`artifacts/uv/pitari/scripts/photo_to_texture.py`の`make_texture`。カテゴリでテンプレートを選ぶ。Tシャツは`artifacts/uv/pitari/uv_template.json`、長そでは`artifacts/uv/pitari/longsleeve/uv_template.json`、シャツは`artifacts/uv/pitari/shirt/uv_template.json`、ズボンは`artifacts/uv/pitari/trousers/uv_template.json`（どれもGitに含まれない）。シャツは、写真の検出・点・切り抜きを長そでとして行う。ないPCでは503を返し、テクスチャは作らない。作り方は[UVテンプレートのREADME](../../artifacts/uv/pitari/README.md)。
- ズボンの切り抜きと服の領域は、ランドマークで囲んだ輪郭の外を背景として教えて作る（`pitari/cutout.py`の`garment_alpha`、[ADR 0024](../../docs/adr/0024-trousers-cutout-with-landmarks.md)）。テクスチャを作るときも同じ関数を使う。
- `/detect`の切り抜きの段階で点を受け取ったら、服の範囲・点・A4の角・服の領域を、写真のJPEGのハッシュで`apps/inference/.cache/detections/`に残す（新しいものから200件）。テクスチャの作業は、同じ写真・大きさ・種類の記録があれば推論と切り抜きを省く（`pitari/detections.py`、[ADR 0048](../../docs/adr/0048-reuse-cutout-for-texture.md)）。使ったときは`report.json`の`notes`に書く。
- モデルは採寸と共有する。推論サービスを起動すると、裏でモデルを読み込む（PyTorchで約30秒、OpenVINOで約1分）。その間と、テクスチャ作成がモデルを使っている間は、採寸のリクエストが最大60秒待ってから処理される。
- 待ちの作業は5件まで。同じ服の作業が待っている間に新しい写真が届いたら置き換える。

## 検証

```powershell
cd apps/inference
./.venv/Scripts/python.exe -m unittest discover -s tests -v
```

実際の推論速度は重みを配置後に測る。`landmarks`はJPEGと服の範囲を指定してランドマークだけを、`texture`は作業フォルダの`input_*.jpg`からテクスチャ1件を作り直して工程ごとの時間を測る。1回目はモデルの読み込みを含むため、2回目以降の時間を比べる。

```powershell
./.venv/Scripts/python.exe benchmark.py landmarks 写真.jpg --category short_sleeve_top --bbox 100 80 900 1100
./.venv/Scripts/python.exe benchmark.py texture textures/2026-10-17_11-01-58_長そで_d6156da4 --reference textures/2026-10-17_11-01-58_長そで_d6156da4/texture.png
```

`--reference`を付けると、色の差が8を超えたテクセルの割合も出す。テクスチャの作業の`job.json`と`report.json`の`timingsMs`にも、同じ工程ごとの時間（ミリ秒）を残す。`front.inference`はモデルのロックを待つ時間を含み、その内訳が`front.paper`・`front.detect`・`front.landmarks`。

学習済み重みがなければベンチマークは終了する。ランダムな重みの時間を実用性能として報告しない。

web・api・推論・ローカルSupabaseの起動後、リポジトリ直下で次の結合テストも実行できる。合成画像でJPEGが不変であること、自動A4縮尺、切り抜きの透明度、採寸・登録・取得・更新・削除を確認し、テストが作った服だけを削除する。実際の服での精度を検証するものではない。

```powershell
./apps/inference/.venv/Scripts/python.exe apps/inference/smoke_local.py
```

## チームへの影響を抑える

仮想環境・モデル・キャッシュ・`.env`はGit管理対象外。web・apiのJavaScript依存は追加していない。他の担当者はPythonを起動しなくても既存の画面を開発できる。推論を使わないapiでは`INFERENCE_TOKEN`は未設定でよい。DBの変更はmigrationとして共有し、クラウドには自動適用しない。OneDriveの同期除外はGitの除外とは別なので、大きいモデルを同期したくない場合はOneDrive側の運用も検討する。

## 確認範囲（2026-10-10）

- Pythonの座標・縮尺・背景透過・工程別処理の11件、TypeScriptの採寸・認証・PNG検証の9件が成功。
- lint・型チェック・本番ビルド・変更ファイルの整形チェックが成功。
- ローカルSupabaseに初期migrationと透過画像用の追加migrationを適用。
- BFF経由で写真のバイト列不変、自動A4縮尺、透過PNGの保存・署名URL取得、寸法更新・削除まで成功。結合テストで作った服は削除済み。
- Grounding DINOの読み込みと合成画像への実行を確認。実際の服での分類精度は未評価。
- HRNetの学習済み重みをCPUで読み込み、合成画像への推論まで成功。実写真でのランドマーク精度・処理時間は未検証。
- 学習済みモデルによる一括処理は合成画像で初回約32.5秒。カテゴリ・ランドマーク・切り抜きは返ったが、パンツを模した図形がTシャツに分類されたため、精度の検証成功とは扱わない。写真による速度・精度の評価が必要。
- ブラウザ接続が利用できず、画面はHTML応答まで確認。クリック操作・見た目・スマートフォン撮影の確認は未実施。

## 参考文献

- [DeepFashion2](https://github.com/switchablenorms/DeepFashion2)
- [HRNet公式実装](https://github.com/svip-lab/HRNet-for-Fashion-Landmark-Estimation.PyTorch)

## 長そでの登録

`long_sleeve_top`を検出・採寸・切り抜き・テクスチャ生成で受け付ける。長そでは33点で、サイズ入力はTシャツと同じ着丈・身幅・肩幅・袖丈。既存のHRNetの重みを使い、モデルの追加取得は不要。撮影の画面では測定の前に服の種類を選び、選んだ種類で検出する。シャツは推論サービスには長そでとして届く。

DBには`supabase/migrations/20261017000100_long_sleeve_top.sql`の適用が必要。ローカルDBを起動して`supabase migration up --local`を実行する。クラウドへの適用はこの変更では行わない。

長そでのテクスチャは[受領素材のREADME](../../artifacts/uv/pitari/inputs/longsleeve/README.md)の手順でテンプレートを準備する。表面を登録し、詳細で裏面を登録すると生成を依頼する。「テクスチャを作る」から再試行できる。結果は他の種類と同じく`textures/{生成日時}_長そで_{服ID先頭8文字}/`に保存する。

## テクスチャのファイル名

フォルダと確認用画像の名前は`{生成日時}_{種類}_{服ID先頭8文字}`で、例は`2026-10-17_11-01-58_長そで_d6156da4.png`。生成日時は変換を開始した日本時間で、`年-月-日_時-分-秒`の順。処理の完了時刻は`job.json`の`completedAt`、服をクローゼットに登録した時刻は`garmentCreatedAt`で確認する。古い履歴など登録日時が不明なら`garmentCreatedAt`は`null`。

確認用画像の名前は`job.json`の`textureFile`に記録する。生成に失敗したフォルダには完成画像がないため、最新画像を探すときは下から順に見て、`.png`のあるフォルダを選ぶ。既存の`texture.png`はBlender確認スクリプトとの互換性のため保持する。[命名の決定](../../docs/adr/0031-texture-filenames-with-dates.md)を参照。
# ローカル採寸サービス

webやapiとは別の、Pythonの仮想環境で動く。DBとStorageにはつながず、Honoから受け取った写真について、縮尺・ランドマーク・透過画像を返す。表と裏の写真からは、服ごとのテクスチャをPCの中のフォルダに作る（下の「服ごとのテクスチャ」）。写真全体の遠近の補正はしない。まずCPUで試し、学習済みのモデルで実際に測ってから、GPUが要るかを決める。

## このPCで準備してあるもの

- `apps/inference/.venv/`のPythonの依存。PC全体のPythonは変えていない。
- `models/hrnet-source/`の、公式のHRNetの実装。ソースだけでは、自動で採寸できない。
- `models/grounding-dino-tiny/`の、服の種類と範囲を見つけるモデル。
- DeepFashion2用の、HRNetの学習済みの重み。このPCでは置いてあり、読み込めることも確かめた。
- A4の紙からの縮尺の計算、元の測定画像への座標の戻し、ドラッグでの調整、GrabCutでの背景の透過。

## HRNetの重みをまだ置いていないPCで、手で入れる

このPCには下の重みが置いてあるので、ダウンロードし直さなくてよい。

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

Tシャツ・長そで・ズボンのどれでも、裏面を保存すると、apiが表のmeasurement画像と裏面を`POST /textures`へ送る（multipartの`garmentId`・`category`・`front`・`back`・`frontSaved`、Bearer認証）。`frontSaved`は、採寸画面で保存した表の点とA4の四隅で、推論の結果より優先して使う。服の詳細の「テクスチャを作る」から、保存した写真で作り直せる。推論サービスは受け付けたらすぐ202を返し、裏のスレッドで1件ずつ作る。できたものは、次のPCの中のフォルダに書き出す。CPUで1〜数分かかる。

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
