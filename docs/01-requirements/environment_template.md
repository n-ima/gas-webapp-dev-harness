# 環境・リリース自動化情報

このファイルは、リリースフェーズを自動実行するために **必須の入力** になる。
要件定義フェーズの中で必ず埋める（曖昧なまま設計・実装に進まない）。

このハーネスはデプロイ先が **Google Apps Script（GAS）** に固定のため、確定事項は
記入済み。「**要選択**」「**要記入**」の項目だけをプロジェクトごとに埋める
（技術的な背景は `.github/skills/stack-conventions/SKILL.md`、
デプロイ手順の正は `.github/skills/deploy-gas/SKILL.md` を参照）。

## デプロイ先

| 項目 | 内容 |
|---|---|
| ホスティング/実行環境 | Google Apps Script（V8ランタイム） |
| スクリプト種別 | **要選択**: コンテナバインド（特定シート専用ツール向き） / スタンドアロン（Webアプリ主体・複数シート向き） |
| スクリプトID（`.clasp.json` の `scriptId`） | **要記入**（初回の `clasp create-script` / `clasp clone-script` 後に転記） |
| デプロイ手段 | clasp v3系（`push` → `create-version` → 初回のみ `create-deployment`、以後 `update-deployment` でURL不変） |
| 前提ツール | Node.js LTS、`npm i -g @google/clasp`（v3.3以上）、Apps Script APIの有効化（初回・人手）、`clasp login`（人手） |
| CI/CDの有無 | **要選択**: なし（ローカルからclasp実行） / GitHub Actions + clasp（`deploy-gas` のCI/CD節参照） |

## Webアプリ設定（Webアプリの場合のみ。使わない場合は「該当なし」と明記）

| 項目 | 内容 |
|---|---|
| エントリポイント | `doGet` / `doPost`（`HtmlOutput` / `TextOutput` を返す） |
| 実行ユーザー（`webapp.executeAs`） | **要選択**: `USER_DEPLOYING`（デプロイした本人の権限で動く） / `USER_ACCESSING`（アクセスした人の権限で動く） |
| アクセスできるユーザー（`webapp.access`） | **要選択**: `MYSELF` / `DOMAIN` / `ANYONE`（Googleログイン必須） / `ANYONE_ANONYMOUS`（匿名アクセス可） |
| アクセス制御方式（利用者の絞り込み） | **要選択**: 不要（上記accessで足りる） / **アプリ層allowlist**（特定チーム限定。`webapp.access` では特定ユーザー集合に絞れない＝`DOMAIN`はドメイン全体。構成は `.github/skills/gas-access-control/SKILL.md` の判定表で決める） |
| allowlistの管理場所（allowlist採用時のみ） | **要選択**: スクリプトプロパティ（少人数・変更少） / 管理用シート（運用者が編集。デプロイ者のみ編集可） |
| デプロイID / 本番URL（`/exec`） | **要記入**（初回 `create-deployment` 後に転記。以後このデプロイIDを更新し続ける＝URL不変） |

## 認証・認可・シークレット

| 項目 | 内容 |
|---|---|
| デプロイに必要な認証情報 | GoogleアカウントのOAuth（`clasp login`。ホームディレクトリの `.clasprc.json` に保存。コミット絶対不可） |
| GCPプロジェクト紐付け | **要選択**: 不要（既定） / 必要（Advanced Services 利用・OAuth同意画面のカスタマイズ等が要る場合のみ） |
| oauthScopes | **要記入**: `appsscript.json` に最小限を明示列挙（スコープ変更は利用者の再承認＝人手が発生することに注意） |
| アプリが使うシークレットの保管場所 | PropertiesService スクリプトプロパティ（コード・リポジトリ・docsに書かない） |
| CI用認証情報（CIを使う場合のみ） | GitHub Secrets（`.clasprc.json` 相当の内容を保管。コード非記載） |
| エージェントがアクセスできないもの | ブラウザでのOAuth同意操作、スクリプトプロパティへの実値の投入（いずれも人手） |

## 自動化できる/できない境界

GAS前提の既定の分類（プロジェクトで変える場合はこの表を更新する）。

| 作業 | 自動化可否 | 理由・人手が必要な場合の担当 |
|---|---|---|
| ビルド（TypeScript→dist） | 自動 | — |
| テスト実行（ローカル層のユニットテスト） | 自動 | — |
| `clasp push`（コード反映） | 自動 | — |
| `clasp create-version` / `update-deployment`（リリース） | 自動 | 実行直前にユーザーの最終承認を1回経由（AGENTS.mdの破壊的操作ルール） |
| Apps Script API有効化・`clasp login`（OAuth同意） | **人手** | ブラウザでの手動承認が技術的に必須 |
| 初回実行時・スコープ変更時のスコープ承認 | **人手** | 同上 |
| 「アクセスできるユーザー」（`webapp.access` / `executeAs`）の設定変更 | **人手** | アクセス範囲の変更はセキュリティ影響が大きいため |
| スクリプトプロパティへのシークレット投入 | **人手** | エージェントにシークレット実値を渡さない |
| `git push` / タグ付け | 自動化可だが毎回確認 | hooksによりask（確認）が入る |

「人手」に分類した項目は、リリースエージェントが該当ステップで作業内容を提示し、
ユーザーに実行してもらってから先に進む。

## ロールバック方針

- 失敗時に自動でロールバックしてよい範囲: デプロイの参照バージョンを旧番号へ付け替える
  （`clasp update-deployment`。URL不変のままコード状態だけ戻る）。
- 人手でのロールバック判断が必要なケース: スプレッドシートのデータ・スクリプトプロパティに
  影響する変更（バージョン管理外のため）、oauthScopesやアクセス設定の変更を伴うリリース。

## この環境向けの既存Skillの有無

`.github/skills/deploy-<environment>/SKILL.md` に該当する手順が既にあるか確認する。

- 該当する既存Skill: **あり — `.github/skills/deploy-gas/SKILL.md`（事前同梱済み）**。
  リリースフェーズはこのSkillを正とする。
- GAS以外の外部サービスが関わる場合のみ、`skill-authoring` スキルで
  `deploy-<service>` を追加作成する。
