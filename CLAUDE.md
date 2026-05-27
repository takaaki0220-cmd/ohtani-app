# 大谷翔平アプリ — Cloudflare Workers デプロイ練習プロジェクト

## このプロジェクトの目的
Claude Code を使った初めてのデプロイ練習。
GitHub に push → Cloudflare Workers で自動公開、の流れを体験することが第一目標。

## アプリの内容
大谷翔平の成績をリアルタイムで確認できる1ページアプリ。
スポーツナビの「大谷翔平専用版」のようなコンセプト。

### 機能
- 個人成績を MLB Stats API（statsapi.mlb.com）からリアルタイム取得
- 打撃成績・投手成績はタブで切り替え
- シーズン中は当年データ、シーズンオフは最新完了シーズンの最終成績を表示
- 可能であれば本塁打数や打率などのMLBランキングも表示

### データ源
- MLB Stats API（無料・認証不要・CORS対応）
- 大谷翔平の Player ID: 660271

### デザイン方針
- 「AIが作ったデザインっぽくない」見た目を目指す
- 枠線は基本使わない（背景の濃淡とタイポグラフィで階層を作る）
- カラーはドジャースネイビー (#005A9C) と白〜薄グレーの濃淡のみ
- フォントは -apple-system（Mac標準）

## デプロイ構成（決定済み）
- ホスティング: Cloudflare Workers（静的アセット機能を使う。Pages ではない）
  - 理由: Cloudflare は新規プロジェクトに Pages ではなく Workers を公式推奨しているため
- DB・認証: 使わない（Supabase も不使用）
- フロント: React (Vite, JavaScript)

## 技術的に注意すべき点
- SPA なので Cloudflare の設定で not_found_handling を single-page-application にする
- node_modules 等は .assetsignore で除外する
- 設定ファイルは wrangler.jsonc

## 進め方
1. ローカルでアプリを動かす ← 現在ここ
2. GitHub リポジトリを作って push
3. Cloudflare 側でリポジトリを連携し、自動デプロイを設定
4. push するたび自動公開される状態にする

## 私（たかあき）について
- Claude Code は初めて。デプロイも初めて。
- 各ステップで「なぜそうするか」を簡潔に説明してほしい。
- 忖度や曖昧な説明は不要。トレードオフは最初から正直に。
