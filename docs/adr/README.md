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
- [0007 服が体に突き抜けるのは、服を体の外へ押し出して防ぐ](0007-push-shirt-out-only.md)
- [0008 身長はBlenderで作った身長キーで変え、基準寸法とキーの効き方は身長ごとの表で持つ](0008-height-keys-and-tables.md)
- [0009 アバターの体は、体重ではなく4つの体型から選ぶ](0009-build-instead-of-weight.md)
- [0010 髪・靴のプリセットは、骨格ではなく体と同じシェイプキーで体に合わせる](0010-presets-follow-body-with-shape-keys.md)
- [0011 長袖は、Tシャツの袖を手首まで伸ばして作る](0011-longsleeve-from-tshirt.md)

## 参考文献

- [ハッカソンでドキュメントを書く【ADR】（Qiita）](https://qiita.com/K-Kizuku/items/dd79abcd4b9690026a99)：短期間のハッカソン向けの項目立て。上の6項目はここから借りた
