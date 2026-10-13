# ADR

決めたことと、その理由を1件ずつ残す。コードを読めば「今どうなっているか」は分かるが、「なぜそうしたか」は分からなくなるため。

## 書き方

ファイル名は `NNNN-内容.md`（4桁の連番）。中身は次の6つを短く書く。

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
- [0004 webはVercelに、手元のCLIからデプロイする](0004-deploy-web-with-vercel-cli.md)
- [0005 3D表示にReact Three Fiberとdreiを使う](0005-3d-with-react-three-fiber.md)
- [0006 服の寸法からシェイプキーの値をブラウザで計算する](0006-solve-shape-keys-in-browser.md)
- [0007 ローカルCPUでA4基準の服採寸を行う](0007-local-garment-measurement.md)
- [0008 採寸を共通の撮影画面へ統合する](0008-integrate-capture-with-app-shell.md)
- [0009 真上撮影では写真を変形せず採寸する](0009-flat-photo-measurement.md)
- [0010 スマホから保存画像をweb経由で取得する](0010-mobile-image-access.md)
- [0011 ランドマークの編集を隠し、寸法名付き矢印で示す](0011-measurement-arrows.md)
- [0012 服の写真をモデル固定のUVテンプレートで貼る](0012-uv-template-for-photo-texture.md)
- [0013 採寸中は細かな進捗の目安と経過時間を表示する](0013-measurement-progress-estimate.md)

## 参考文献

- [ハッカソンでドキュメントを書く【ADR】（Qiita）](https://qiita.com/K-Kizuku/items/dd79abcd4b9690026a99)：短期間のハッカソン向けの項目立て。上の6項目はここから借りた
