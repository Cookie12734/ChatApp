# connect - ChatApp

`connect` は、気軽に会話や相談ができる場所を目指して開発している、会員登録制のチャットアプリケーションです。

フレンドとのダイレクトメッセージ、話題別のランダムマッチング、サーバー形式のグループチャットを一つの画面から利用できます。

## 制作背景

このアプリケーションは、日本での若年層の自殺率が高いことに注目し、気軽に相談できる環境を作りたいという思いから作成しました。

## 主な機能

### 認証

- メールアドレスとパスワードによる登録・ログイン
- 確認メールの送信、再送、メールアドレス認証
- Discord OAuth
- パスワードのハッシュ化と認証処理のレート制限
- 未認証ユーザーのページアクセス制限

### フレンド・ブロック

- ユーザーIDによるフレンド申請
- 申請の承認、見送り、取り消し
- フレンド解除
- 申請通知、承認通知、未読通知の管理
- ユーザーのブロック・解除
- ブロックした相手との申請、マッチング、チャットの制限

### マッチング・ダイレクトメッセージ

- 「雑談」「ゲーム」「悩み事」から話題を選ぶランダムマッチング
- マッチング待機のキャンセル
- フレンドとの1対1チャット
- Server-Sent Events（SSE）によるメッセージと入力状態のリアルタイム更新
- メッセージの編集・削除
- 未読件数と既読状態の管理

### サーバー・グループチャット

- サーバーの作成、編集、削除、退出
- サーバー名、説明、アイコンの設定
- 招待リンクの発行、再発行、リンクからの参加
- テキストチャンネルの作成、編集、削除
- チャンネルごとのメッセージ送信、編集、削除、ピン留め
- サーバーメッセージと未読件数のリアルタイム更新
- メンバー一覧、メンバーの退出処理、所有権の移譲
- サーバーごとのニックネームと自己紹介の設定
- 所有者・メンバーに応じた権限制御

### プロフィール

- 表示名、アイコン、自己紹介、ステータスメッセージの設定
- オンライン、離席中、取り込み中、非表示のプレゼンス設定
- フレンドまたは同じサーバーに参加しているユーザーのプロフィール表示

## 使用技術

- Next.js 15 / React 19 / TypeScript
- Tailwind CSS 4 / shadcn / Radix UI / Lucide React
- tRPC / TanStack Query / Zod
- Auth.js（NextAuth.js）/ bcryptjs / Nodemailer
- Prisma / PostgreSQL
- Server-Sent Events（SSE）
- Node.js Test Runner / Playwright
- Docker / Mailpit

## ローカル環境の起動

Node.js、npm、PostgreSQLを利用できる環境が必要です。付属スクリプトを使う場合はDockerも起動してください。

1. `.env.example` を `.env` にコピーし、環境変数を設定します。

   ```powershell
   Copy-Item .env.example .env
   ```

   macOS / Linuxでは次のコマンドを使用します。

   ```bash
   cp .env.example .env
   ```

2. 依存パッケージをインストールします。

   ```bash
   npm install
   ```

3. ローカルのPostgreSQLを起動します。

   ```powershell
   .\start-database.ps1
   ```

   macOS / Linuxでは次のコマンドを使用します。

   ```bash
   ./start-database.sh
   ```

4. 確認メールをMailpitで受け取る場合は、別のターミナルで起動します。

   ```bash
   npm run mailpit
   ```

   受信ボックスは `http://localhost:8025` です。`EMAIL_SERVER` を設定しない場合、確認リンクは開発サーバーのターミナルに表示されます。

5. 開発サーバーを起動します。起動前に既存のPrismaマイグレーションが自動適用されます。

   ```bash
   npm run dev
   ```

   アプリケーションは `http://localhost:3000` で開きます。

## 環境変数

| 変数 | 用途 | 必須 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL接続先 | はい |
| `AUTH_SECRET` | Auth.jsの署名用シークレット | 本番環境では必須 |
| `AUTH_DISCORD_ID` | Discord OAuthのクライアントID | Discord認証を使う場合 |
| `AUTH_DISCORD_SECRET` | Discord OAuthのクライアントシークレット | Discord認証を使う場合 |
| `EMAIL_SERVER` | 確認メール送信用のSMTP接続先 | 任意 |
| `EMAIL_FROM` | 確認メールの送信元 | 任意 |

## 確認コマンド

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## ディレクトリ構成

```text
chat-app/
├── e2e/                 # Playwright E2Eテスト
├── prisma/              # Prismaスキーマとマイグレーション
├── public/              # 静的ファイル
├── src/
│   ├── app/             # App RouterのページとRoute Handler
│   ├── components/      # 共通UI
│   ├── features/        # auth、chat、friend、profile、server
│   ├── lib/             # 共通処理
│   ├── server/          # DB、tRPC、SSE、レート制限
│   ├── styles/          # グローバルスタイル
│   └── trpc/            # tRPCクライアント設定
├── docker-compose.yml   # Mailpit
└── package.json
```
