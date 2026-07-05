# connect - ChatApp

T3 Stackを利用して開発している、会員登録制のチャットアプリケーションです。

現在は、ユーザー登録・ログイン・メール認証・フレンド申請・通知機能・プロフィール設定・フレンドとの個人チャット・グループチャット・ブロック機能・プロフィール詳細ページなどを実装しています。
Discordのようにユーザー同士が安全に交流できるWebアプリケーションを目指しています。

## 開発目的

Next.jsを中心としたモダンなWebアプリケーション開発を学習するために作成しました。

認証、データベース連携、型安全なAPI通信、UIコンポーネント設計など、実際のWebサービスに近い構成を意識して開発しています。

## 主な機能

### 実装済み機能

#### 認証機能

- ユーザー登録
- ログイン
- ログアウト
- メールアドレス認証
- パスワードのハッシュ化
- Discordアカウントでの認証
- 未ログインユーザーのページアクセス制限

#### ユーザー機能

- ユーザーIDの設定
- 表示名の設定
- ログイン中ユーザー情報の取得

#### プロフィール機能

- 表示名の変更
- アイコン画像のアップロード
- 自己紹介文の設定

#### フレンド機能

- ユーザーIDを使ったフレンド申請
- フレンド申請の承認
- フレンド申請の見送り
- 申請中のユーザー一覧表示
- 届いた申請一覧表示
- フレンド一覧表示
- 自分自身へのフレンド申請防止
- すでにフレンドのユーザーへの重複申請防止

#### 通知機能

- フレンド申請通知
- フレンド申請承認通知
- 未読通知数の表示
- 通知一覧表示
- 通知の既読化

#### 個人チャット機能

- ホーム画面でのチャット表示
- フレンドとの1対1チャット
- メッセージ送信
- チャット履歴表示
- Supabase Realtimeを利用したリアルタイム更新
- 「○○が入力中」の表示

#### チャット画面UI

- Discordのようなサイドバー付きチャット画面
- フレンド一覧の表示
- 現在のホーム画面に合わせた配色

#### グループ機能

- グループチャット
- グループ作成
- 招待リンクからのグループ参加
- グループ退出
- グループメンバー一覧
- グループ内チャンネル作成
- チャンネルごとのメッセージ管理
- チャンネルごとの未読メッセージ管理

#### ブロック機能

- ユーザーのブロック
- ブロック解除
- ブロック中ユーザー一覧
- ブロック中ユーザーからのフレンド申請・チャット制限

#### プロフィール詳細機能

- ステータスメッセージの設定
- プロフィール詳細ページ

#### その他

- レスポンシブ対応の強化
- UI / UXの改善
- エラーハンドリングの強化
- テストコードの追加

## 今後追加予定の機能

- 本番環境へのデプロイ

## 使用技術

### フロントエンド

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI
- Lucide React

### バックエンド

- Next.js App Router
- tRPC
- NextAuth.js
- Prisma

### データベース

- PostgreSQL

### リアルタイム通信

- Supabase Realtime
- Supabase JavaScript Client

### 認証・メール

- NextAuth.js
- Credentials認証
- Discord認証
- Nodemailer
- Mailpit

### 開発環境

- Docker
- Prisma Studio
- ESLint
- Prettier

## 技術構成

このアプリケーションでは、T3 Stackをベースに以下のような構成で開発しています。

- `Next.js App Router` を利用した画面ルーティング
- `NextAuth.js` を利用した認証機能
- `Prisma` を利用したデータベース操作
- `tRPC` を利用した型安全なAPI通信
- `Zod` を利用した入力値バリデーション
- `Tailwind CSS` を利用したUI実装
- `Supabase Realtime` を利用したリアルタイム通信
- `Docker` を利用したローカル開発用データベース環境

## ディレクトリ構成

```txt
ChatApp/
├── prisma/
│   └── schema.prisma
├── public/
│   ├── connect-icon.png
│   └── uploads/
│       └── profile-icons/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── profile/
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   ├── signin/
│   │   │   ├── signup/
│   │   │   └── verify-email/
│   │   ├── chats/
│   │   ├── friends/
│   │   ├── profile/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── ui/
│   ├── features/
│   │   ├── auth/
│   │   ├── chat/
│   │   ├── friend/
│   │   ├── post/
│   │   └── profile/
│   ├── lib/
│   │   └── supabase/
│   ├── server/
│   │   ├── api/
│   │   └── db.ts
│   ├── styles/
│   ├── trpc/
│   └── env.js
├── docker-compose.yml
├── package.json
├── start-database.ps1
├── start-database.sh
└── README.md
```
