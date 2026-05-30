# 大谷翔平アプリ — リアルタイム成績 + プッシュ通知（Cloudflare Workers）

## このプロジェクトの目的
Claude Code を使ったデプロイ練習から始まり、現在は実用的な「大谷翔平専用スポーツアプリ」。
GitHub に push → Cloudflare Workers で自動公開（2〜3分で反映）。

## 公開URL
https://ohtani-app.tkak2-studio.workers.dev

## アプリの内容
大谷翔平の成績をリアルタイムで確認できる1ページアプリ（スポーツナビの大谷専用版イメージ）。

### 機能（実装済み）
- 個人成績を MLB Stats API（statsapi.mlb.com）からリアルタイム取得
- **タブ**: 打撃 / 投手 / 日程（画面下固定のボトムタブバー）
- シーズン中は当年、シーズンオフは最新完了シーズンの最終成績
- **セイバー指標**: wRC+ / WAR / wOBA / FIP / xFIP / ERA- など（sabermetrics エンドポイント）
- **二刀流 総合WAR**（打者WAR + 投手WAR）をヘッダーに強調、162試合ペース表示
- **MLBランキング**: 各指標カードをタップ → ランキング表示（総合/ア・リーグ/ナ・リーグ）。
  初回は総合・ナ・リーグのみ取得、ア・リーグは開いた時に遅延取得
- **日程**: ドジャース戦を日本時間で表示、連戦単位でグループ化、大谷の登板予定マーク
- **PWA**: ホーム画面追加可、引っ張って更新（自前実装）、オフラインキャッシュ
- **プッシュ通知**: HR / 試合開始 / 登板 / 試合終了 をiPhoneへ通知（アプリ内で個別ON/OFF）

### データ源
- MLB Stats API（無料・認証不要・CORS対応）
- 大谷翔平の Player ID: 660271 / ドジャース teamId: 119

### デザイン方針
- 「AIが作ったデザインっぽくない」ミニマル高級UI
- 枠線は基本使わない（背景の濃淡・余白・タイポグラフィで階層）
- カラーはドジャースネイビー (#005A9C) 系の濃淡＋白〜薄グレー。アクセント追加は最小限
- フォントは -apple-system

## デプロイ構成
- ホスティング: Cloudflare Workers（静的アセット + Worker スクリプト。Pages ではない）
- フロント: React (Vite, JavaScript)
- 自動デプロイ: GitHub `takaaki0220-cmd/ohtani-app` → push で `npx wrangler deploy`
- 設定ファイル: wrangler.jsonc（main=worker/index.js, assets, kv_namespaces, triggers.crons, vars）

## プッシュ通知の構成（重要）
- **Worker** `worker/index.js`: fetch（/api/* と静的アセット配信）+ scheduled（Cron 1分ごと）
- **Cron**: 試合中だけ MLB のライブフィードを見て HR/開始/登板/終了 を検知し Web Push 送信
- **KV** (binding `KV`): 購読情報（`sub:*`）と試合の通知済み状態（`game:*`）を保存
- **Web Push 暗号化** `worker/webpush.js`: VAPID(ES256) + aes128gcm を Web Crypto で自前実装
- **VAPID 公開鍵**: wrangler.jsonc の vars `VAPID_PUBLIC_KEY`（公開情報）
- **VAPID 秘密鍵**: Cloudflare のシークレット `VAPID_PRIVATE_JWK`（ダッシュボードで設定、リポジトリには置かない）
- **Service Worker** `src/sw.js`: injectManifest。push / notificationclick ハンドラ + プリキャッシュ
- **クライアント** `src/notifications.js` / `src/NotificationSettings.jsx`: 許可要求・購読・設定
- 制約: iOS 16.4+ かつホーム画面追加した PWA のみ。通知は最大1〜2分遅延

## 技術的に注意すべき点
- SPA: wrangler の assets で not_found_handling = single-page-application
- /api/* は Worker が処理、それ以外は env.ASSETS.fetch で静的配信
- node_modules 等は .assetsignore で除外
- VAPID 秘密鍵などの秘密情報は wrangler secret / ダッシュボードで設定（平文の var にしない）

## 私（たかあき）について
- 非エンジニア。各ステップで「なぜそうするか」を簡潔に説明してほしい
- 外部サービス（GitHub/Cloudflare）操作は最新UIの画面文言通りに、省略せず案内する
- 忖度や曖昧な説明は不要。トレードオフは最初から正直に
