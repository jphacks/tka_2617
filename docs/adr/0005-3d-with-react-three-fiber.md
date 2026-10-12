# 0005 3D表示にReact Three Fiberとdreiを使う

日付：2026-10-10

## 背景

アバター画面で、Blender（MPFB2）で作った服の.glbを表示し、シェイプキーを数値で動かして形を変えたい。今後は体型のシェイプキーも同じように動かす。Next.jsの画面の中で、Reactの状態からシェイプキーの値を渡せる作りが要る。

## 決定

- `three`、`@react-three/fiber`、`@react-three/drei`を使う（型は`@types/three`）
- three.jsはブラウザのWebGLで動くので、`next/dynamic`の`ssr: false`で読み込む。`ssr: false`はServer Componentで使えないため、`avatar-viewer.tsx`（Client Component）を挟む
- .glbは`apps/web/public/models/`に置き、dreiの`useGLTF`で読む
- シェイプキーの値は、`<mesh morphTargetInfluences={...}>`のpropsで渡す。読み込んだモデルを直接書き換えない（React Compilerのlintが禁止するため）
- 3D表示はNext.jsの`catchError`で囲み、読み込みやWebGLに失敗しても、画面と下部ナビは残す。もう一度試すときは、`useGLTF`が覚えている失敗を消してから読み直す

## 理由

- シェイプキーの値をReactの状態とpropsで扱えるので、入力欄から3Dまでを素直に書ける
- `useGLTF`（読み込み）、`OrbitControls`（回転と拡大）、`Bounds`（モデルを枠に収める）が揃っていて、短く書ける
- three.jsの初期化、リサイズ、破棄をuseEffectで自分で書かずに済む

## 代替案

- threeだけを使う：依存は最小だが、シーンの初期化、リサイズ、破棄をuseEffectで書くことになり、シェイプキーの更新も手で同期する
- `@google/model-viewer`：表示だけなら一番簡単だが、シェイプキーを動かして形を変える用途に向かない

## 影響

- three.jsなどは`/avatar`を開いたときだけ読まれ、ほかの画面の読み込みは重くならない
- .glbは、マテリアルを不透明（Opaque）で書き出す。半透明（`alphaMode: BLEND`）のままだと、three.jsが奥行きを書き込まず、服の前と後ろが逆の順番で描かれることがある。今の`tshirt.glb`はBLENDのままで、書き出し直しが要る
- 今の`tshirt.glb`は4.5MBで、ほとんどが2048pxのPNGのテクスチャ。スマホの回線では読み込みに時間がかかるので、テクスチャの圧縮を検討する
- `useGLTF`は、Draco圧縮のglbを読むときだけ、デコーダーを外部（gstatic.com）から取ってくる。今のglbは圧縮していないので取りに行かない

## 参考文献

- Next.jsのバンドルされたdocs：`apps/web/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`（`ssr: false`はClient Componentでだけ使えること）
- Next.jsのバンドルされたdocs：`apps/web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/catchError.md`
- [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction)
- [drei: useGLTF](https://drei.docs.pmnd.rs/loaders/gltf-use-gltf)
- [glTF 2.0: alphaMode](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#alpha-coverage)
