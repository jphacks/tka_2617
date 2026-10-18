# スマホから保存画像をweb経由で取得する

日付：2026-10-10

## 背景

ローカルStorageの署名URLには127.0.0.1が含まれる。スマホで開くと、PCではなくスマホ自身につながってしまう。

## 決定

画像の取得はweb→api→Storageで中継する。apiは、服ID・画像IDがデモユーザーのものかを確かめる。webだけをLANから接続できるように起動する。スマホでは既存のfile入力のcapture属性で端末の撮影画面を開く。

## 理由

Storageの接続先やポートをスマホ側へ公開せず、画像を取得できる。依存の追加やDBの変更は要らない。

## 代替案

署名URLのホスト名をPCのIPに書き換える方法では、Storageにも直接つなぐ必要がある。ブラウザ内にカメラの映像を出す方法は、HTTPSが要るため、今回の静止画撮影では使わない。

## 影響

画像転送がwebとapiを通る。ログインがまだ無いので、LAN内での開発の確認に限る。実際のスマホでの動きは、OSとブラウザによって違う。

## 参考文献

- [MDNのcapture属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)
- [MDNのgetUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
