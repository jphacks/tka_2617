# サンプル（プロダクト名）

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2026/07/IMG_5316.png)](https://www.youtube.com/watch?v=piaNsc6ilBI)

## ローカルの環境構築

必要なもの：Node.js 22、pnpm 10.18.0、Docker Desktop、Supabase CLI。Docker Desktopを起動して、リポジトリのルートで実行する。

```bash
pnpm install
supabase start
```

初回だけ、環境変数ファイルを作る。既にある場合はコピーせず、そのまま使う。

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

- `apps/api/.env`の`SUPABASE_SECRET_KEY`に、`supabase status -o env`で表示される`SECRET_KEY`を設定する（古いCLIでは`SERVICE_ROLE_KEY`）。
- `openssl rand -hex 32`でトークンを生成し、両方のファイルの`INTERNAL_API_TOKEN`に同じ値を設定する。
- `.env`類や秘密の値はcommitしない。

```bash
pnpm dev
```

画面は<http://localhost:3000>、apiは<http://localhost:3001>。<http://localhost:3000/api/health>が`{"ok":true}`を返せば、webからapiへの接続を確認できる。

Dockerを使うのはローカルSupabaseだけ。`supabase start`後にDocker Desktopにコンテナが表示される。webとapiは`pnpm dev`で直接起動する。

停止は`pnpm dev`のターミナルで`Ctrl+C`、Supabaseは`supabase stop`。DB変更やデプロイの手順は[セットアップ](docs/setup.md)を参照する。

## 製品概要
### 背景(製品開発のきっかけ、課題等）
### 製品説明（具体的な製品の説明）
### 特長
#### 1. 特長1
#### 2. 特長2
#### 3. 特長3

### 解決出来ること
### 今後の展望
### 注力したこと（こだわり等）
* 
* 

## 開発技術
### 活用した技術
#### API・データ
* 
* 

#### フレームワーク・ライブラリ・モジュール
* 
* 

#### デバイス
* 
* 

### 独自技術
#### ハッカソンで開発した独自機能・技術
* 独自で開発したものの内容をこちらに記載してください
* 特に力を入れた部分をファイルリンク、またはcommit_idを記載してください。
