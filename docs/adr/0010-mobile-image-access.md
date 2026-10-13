# スマホから保存画像をweb経由で取得する

日付：2026-10-10

## 背景

ローカルStorageの署名URLには127.0.0.1が含まれ、スマホではスマホ自身を参照してしまう。

## 決定

画像取得をweb→api→Storageで中継する。服ID・画像ID・デモユーザーの所有関係をapiで確認する。webだけをLANから接続できるように起動する。スマホでは既存のfile入力のcapture属性で端末の撮影画面を開く。

## 理由

Storageの接続先やポートをスマホ側へ公開せず、画像を取得できる。依存追加・DB変更は不要。

## 代替案

署名URLのホスト名をPCのIPへ書き換える方法では、Storageへの直接接続も必要となる。ブラウザ内のライブカメラ表示はHTTPSを必要とするため、今回の静止画撮影では導入しない。

## 影響

画像転送がwebとapiを通る。ログイン未実装のため、LAN内での開発確認に限定する。スマホ実機の挙動はOSとブラウザに依存する。

## 参考文献

- [MDNのcapture属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)
- [MDNのgetUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
