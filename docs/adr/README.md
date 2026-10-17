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
- [0022 Pythonのlintと整形にruffを使い、ディレクトリごとに入れていく](0022-python-lint-with-ruff.md)

## 参考文献

- [ハッカソンでドキュメントを書く【ADR】（Qiita）](https://qiita.com/K-Kizuku/items/dd79abcd4b9690026a99)：短期間のハッカソン向けの項目立て。上の6項目はここから借りた
