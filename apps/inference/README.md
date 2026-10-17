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

Tシャツ・長そで・ズボンのいずれも、裏面を保存すると、apiが表のmeasurement画像と裏面を`POST /textures`（multipartの`garmentId`・`category`・`front`・`back`、Bearer認証）へ送る。服の詳細の「テクスチャを作る」から保存済み写真で再生成できる。推論サービスは受け付けたらすぐ202を返し、裏の作業スレッドで1件ずつ作る。画面には受付結果を表示し、生成物は次のPC内のフォルダだけに書き出す。CPUで数分かかる。

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

服IDはクローゼットの詳細画面のURL（`/garments/{服ID}`）で分かる。生成のたびに新しい日時のフォルダができ、前の結果は残る。同じ服を同じ秒に作り直した場合は末尾に`_2`などを付ける。服を削除してもこのフォルダは消えない。点や服の領域を直して作り直す手順と、3Dモデルで見る手順は[UVテンプレートのREADME](../../artifacts/uv/pitari/README.md)の「写真で試す」と同じ。

アプリでは、撮影画面で表の写真を入れ、カテゴリを「パンツ」にして裏面も追加し、「クローゼットに登録」を押す。あとから裏面を加える場合は、服の詳細から登録する。生成依頼に失敗した場合は推論サービスの設定・起動とUVテンプレートを確認し、詳細の「テクスチャを作る」で再試行する。受付成功は完成を意味しない。`job.json`が`done`になったら`texture.png`を確認する。

2026-10-15に、受領したズボン用のバージョン2テンプレートで、実際のジーンズの表裏写真をサービスと同じ`texture.make`へ渡し、自動推論から`job.json: done`と2048×2048のテクスチャの保存まで確認した（約163秒）。塗り残し0、反転した三角形0。手修正したマスクは渡していないため、写真の床や影の混入は目視確認が必要。

- 変換の本体は`artifacts/uv/pitari/scripts/photo_to_texture.py`の`make_texture`。カテゴリでテンプレートを選ぶ。Tシャツは`artifacts/uv/pitari/uv_template.json`、長そでは`artifacts/uv/pitari/longsleeve/uv_template.json`、ズボンは`artifacts/uv/pitari/trousers/uv_template.json`（どれもGitに含まれない）。ないPCでは503を返し、テクスチャは作らない。作り方は[UVテンプレートのREADME](../../artifacts/uv/pitari/README.md)。
- ズボンの切り抜きと服の領域は、ランドマークで囲んだ輪郭の外を背景として教えて作る（`pitari/cutout.py`の`garment_alpha`、[ADR 0024](../../docs/adr/0024-trousers-cutout-with-landmarks.md)）。テクスチャを作るときも同じ関数を使う。
- モデルは採寸と共有する。テクスチャ作成がモデルを使っている間は、採寸のリクエストが最大60秒待ってから処理される。
- 待ちの作業は5件まで。同じ服の作業が待っている間に新しい写真が届いたら置き換える。

## 検証

```powershell
cd apps/inference
./.venv/Scripts/python.exe -m unittest discover -s tests -v
```

実際の推論速度は重みを配置後、JPEGと服の範囲を指定して測る。

```powershell
./.venv/Scripts/python.exe benchmark.py --help
```

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
