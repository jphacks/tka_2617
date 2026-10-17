# ADR

決めたことと、その理由を1件ずつ残す。コードを読めば「今どうなっているか」は分かるが、「なぜそうしたか」は分からなくなるため。

## 書き方

ファイル名は`NNNN-内容.md`（4桁の連番）。中身は次の6つを短く書く。

- 背景：何に困っていたか
- 決定：何を決めたか
- 理由：なぜそれを選んだか
- 代替案：他に何を考えて、なぜ選ばなかったか
- 影響：決めたことで何が変わるか
- 日付

## 一覧

- [0001 web と api を分け、ブラウザに DB のキーを渡さない](0001-separate-web-and-api.md)
- [0002 ログインはまだ作らず、デモ用の1ユーザーで進める](0002-no-login-yet.md)
- [0003 スマホ向けのアプリはPWAで作る](0003-pwa.md)
- [0004 webはVercelに、VercelのCLIでデプロイする](0004-deploy-web-with-vercel-cli.md)
- [0005 3D表示にReact Three Fiberとdreiを使う](0005-3d-with-react-three-fiber.md)
- [0006 服の寸法からシェイプキーの値をブラウザで計算する](0006-solve-shape-keys-in-browser.md)
- [0007 服が体に突き抜けるのは、服を体の外へ押し出して防ぐ](0007-push-shirt-out-only.md)
- [0008 身長はBlenderで作った身長キーで変え、基準寸法とキーの効き方は身長ごとの表で持つ](0008-height-keys-and-tables.md)
- [0009 アバターの体は、体重ではなく4つの体型から選ぶ](0009-build-instead-of-weight.md)
- [0010 ローカルCPUでA4基準の服採寸を行う](0010-local-garment-measurement.md)
- [0011 採寸を共通の撮影画面へ統合する](0011-integrate-capture-with-app-shell.md)
- [0012 真上撮影では写真を変形せず採寸する](0012-flat-photo-measurement.md)
- [0013 スマホから保存画像をweb経由で取得する](0013-mobile-image-access.md)
- [0014 ランドマークの編集を隠し、寸法名付き矢印で示す](0014-measurement-arrows.md)
- [0015 服の写真をモデル固定のUVテンプレートで貼る](0015-uv-template-for-photo-texture.md)
- [0016 採寸中は細かな進捗の目安と経過時間を表示する](0016-measurement-progress-estimate.md)
- [0017 髪・靴のプリセットは、骨格ではなく体と同じシェイプキーで体に合わせる](0017-presets-follow-body-with-shape-keys.md)
- [0018 長袖は、Tシャツの袖を手首まで伸ばして作る](0018-longsleeve-from-tshirt.md)
- [0019 長袖のシャツは、male_casualsuit03 のシャツを使い、前の開け閉めはキーで作る](0019-shirt-from-casualsuit03.md)
- [0020 服の裏面の写真を別のroleで保存し、詳細画面で表と並べる](0020-back-photo-as-separate-role.md)
- [0021 購入時期は年月、着る時期は春夏秋冬の複数選択で服に持つ](0021-purchase-month-and-seasons.md)
- [0022 Pythonのlintと整形にruffを使い、ディレクトリごとに入れていく](0022-python-lint-with-ruff.md)
- [0023 服ごとのテクスチャは推論サービスがPC内のフォルダに作り、画面とAPIには出さない](0023-garment-texture-on-pc.md)
- [0024 ズボンの切り抜きでは、ランドマークで囲んだ輪郭の外を背景として教える](0024-trousers-cutout-with-landmarks.md)
- [0025 ズボンのテクスチャは、脚ごとのUVの島を前後に分けて表と裏の写真を貼る](0025-trousers-uv-template.md)
- [0026 ズボンのテクスチャを受領したモデルとUVへ切り替える](0026-trousers-template-from-delivered-uv.md)
- [0027 保存済みの表裏写真からテクスチャを再生成できるようにする](0027-request-texture-from-saved-photos.md)
- [0028 長そでの登録と受領UVを使ったテクスチャ生成](0028-long-sleeve-top.md)
- [0029 DBの型をmigrationから作ってcommitし、apiのSupabaseのクライアントに付ける](0029-commit-db-types.md)
- [0030 APIの型はapiのzodから作ってHono RPCで渡し、Orvalは入れない](0030-api-types-from-zod-not-orval.md)
- [0031 テクスチャの保存フォルダを生成日時から始める](0031-texture-filenames-with-dates.md)
- [0032 重ね着の「タイト」「小さすぎます」は、中の服1枚分の厚みを体の身幅に足して決める](0032-layered-fit-status.md)
- [0033 完成したテクスチャは、apiが推論サービスから受け取ってStorageに置き、画像のAPIで配る](0033-serve-texture-through-api.md)
- [0034 デモまではアバターを男性だけで作り、女性は時間があれば足す](0034-male-avatar-first.md)
- [0035 撮影の画面で最初に服の種類を選び、シャツを種類に足す](0035-choose-garment-type-first.md)
- [0036 アバターの設定は、ログインを入れるまでブラウザのlocalStorageに保存する](0036-avatar-settings-in-browser.md)
- [0037 テクスチャのUVは、アプリのglbのUVを正とし、変換しない](0037-app-glb-uv-is-source.md)
- [0038 シャツのテクスチャは、前後から投影したUVの外周を写真の輪郭に合わせて作る](0038-shirt-texture-from-projected-uv.md)
- [0039 アバターの服の寸法は、基準寸法の半分から2倍までをモデルへ渡し、確かめた範囲の外は案内だけ出す](0039-garment-size-limits.md)
- [0042 テクスチャを作るときは、同じ写真を切り抜いたときの範囲・点・服の領域を使い回す](0042-reuse-cutout-for-texture.md)

## 参考文献

- [ハッカソンでドキュメントを書く【ADR】（Qiita）](https://qiita.com/K-Kizuku/items/dd79abcd4b9690026a99)：短期間のハッカソン向けの項目立て。上の6項目はここから借りた
