# AGENTS.md

このリポジトリのガイドは `CLAUDE.md` にある。作業前に必ず読むこと。

- `CLAUDE.md` — 目的・機能・デプロイ構成・プッシュ通知の仕組み・注意点（プロジェクト全般）

特に重要:

- VAPID 秘密鍵などの秘密情報はリポジトリに置かない（Cloudflare のシークレット/ダッシュボードで設定。平文の var にしない）
- デプロイは `git push origin main` だけ（Workers Builds が自動ビルド＆配信、2〜3分で反映）
