---
name: deploy-gas
description: Google Apps Script(GAS)へのデプロイ手順。clasp v3のログイン/push/バージョン作成/デプロイ更新、デプロイID固定によるWebアプリURL不変化、検証、旧バージョンへのロールバック、人手必須作業(初回OAuth同意・スコープ再承認)、GitHub Actions自動化。リリースエージェントがGASへリリースするときに使う。
---

# GASデプロイスキル（deploy-gas）

このハーネスはデプロイ先が **Google Apps Script に固定** されているため事前同梱している
（DECISIONS.md GD04）。コマンドは **clasp v3系**（2026-07-06 に v3.3.0 で裏取り。
v2系とはコマンド名が異なるので注意。出典: DECISIONS.md GD02）。

## 前提条件

- Node.js（LTS）+ `npm install -g @google/clasp`（v3.3以上）。
- **Apps Script API の有効化**（初回のみ・人手）:
  https://script.google.com/home/usersettings で「Google Apps Script API」をオンにする。
- **認証**: `clasp login`（ブラウザでOAuth同意。人手）。認証情報はホームディレクトリの
  `.clasprc.json` に保存される。**このファイルは秘密情報**として扱い、
  リポジトリに絶対にコミットしない（`.gitignore` 済みか確認する）。
- 認証状態の確認: `clasp list-scripts` が成功すればログイン済み。
  失敗したら `clasp login` をユーザーに依頼する（ブラウザ操作のため人手）。

## clasp v3 コマンド早見表（v2との違いに注意）

| 目的 | clasp v3 | （旧v2） |
|---|---|---|
| 新規プロジェクト作成 | `clasp create-script` | `clasp create` |
| 既存プロジェクト取得 | `clasp clone-script <scriptId>` | `clasp clone` |
| コード反映 | `clasp push [--force]` | 同じ |
| 不変バージョン作成 | `clasp create-version "説明"` | `clasp version` |
| バージョン一覧 | `clasp list-versions` | `clasp versions` |
| 新規デプロイ | `clasp create-deployment` | `clasp deploy` |
| **既存デプロイの更新** | `clasp update-deployment <deploymentId>` | `clasp deploy -i <id>` |
| デプロイ一覧 | `clasp list-deployments` | `clasp deployments` |
| Webアプリを開く | `clasp open-web-app` | `clasp open --web` |
| ログ確認 | `clasp tail-logs [--watch]` | `clasp logs` |

各コマンドの詳細フラグは `clasp <command> --help` で確認する（この表に無いフラグを
記憶で書かない）。

## 前提リソースの冪等な初期化

初回・2回目以降のどちらで実行しても安全な手順:

1. `.clasp.json` が存在し `scriptId` が入っているか確認する。
   - **ある** → そのまま次へ（既存プロジェクト）。
   - **ない** → 既存のGASプロジェクトがあるなら `clasp clone-script <scriptId>`、
     完全新規なら `clasp create-script` で作成し、生成された `.clasp.json` の
     `rootDir` をビルド出力先（`dist/` 等）に設定する。
2. `appsscript.json` に `runtimeVersion: "V8"`・`oauthScopes`・（Webアプリなら）
   `webapp.access` / `webapp.executeAs` が設定済みか確認する（`stack-conventions` 参照）。
3. スクリプトプロパティに必要なシークレット/設定値が入っているか確認する。
   未設定なら「何のキーをどこで入れるか」を提示してユーザーに設定してもらう（人手）。
4. 対象スプレッドシート等の依存リソースが存在するか確認する（IDで開けるか）。

## デプロイ手順（URL不変の標準フロー）

**原則: 本番WebアプリのURLを変えない。** `/exec` URLはデプロイIDに紐づき、
**デプロイの参照バージョンを更新してもURLは不変**（裏取り済み）。
毎回 `create-deployment` すると新URLが生えて利用者のブックマークが壊れるため、
**2回目以降は必ず `update-deployment`** を使う。

```bash
# 1. ビルド（TS構成の場合。stack-conventions 参照）
npm run build

# 2. コード反映
clasp push

# 3. 不変バージョンを作成（説明にリリース内容を書く）
clasp create-version "v1.2.0: 一覧画面のフィルタ追加"

# 4a. 初回のみ: デプロイを作成し、出力された deploymentId を記録する
clasp create-deployment
#    → deploymentId と /exec URL を environment.md に記録（以後この deploymentId を使い続ける）

# 4b. 2回目以降: 既存デプロイを新バージョンへ更新（URL不変）
clasp update-deployment <deploymentId>
```

- `/dev` URL（headデプロイ）は保存済み最新コードが即反映される**テスト用**
  （編集権限者のみアクセス可）。本番利用者には `/exec` だけを案内する。
- `git push` / タグ付けはハーネスの hooks により必ずユーザー確認（ask）が入る。
  デプロイ実行自体も、リリース直前にユーザーの最終承認を得てから行う（AGENTS.md）。

## 検証手順

1. `clasp list-deployments` で対象デプロイが新バージョンを指しているか確認する。
2. WebアプリURL（`/exec`）へ疎通確認する。
   - `webapp.access` が `ANYONE_ANONYMOUS` の場合: `curl -L` で200と期待コンテンツを確認
     （GASはリダイレクトを返すため `-L` 必須）。
   - Googleログインが必要な設定の場合: 自動疎通は不可。ユーザーにURLを開いてもらい、
     表示を確認してもらう（人手）。
3. `clasp tail-logs` またはApps Scriptエディタの「実行数」画面で、アクセス時の
   エラーが出ていないか確認する。
4. Webアプリの主要フローの動作確認は `test-case-design` スキルのGAS節
   （Playwright確認）に従う。

## ロールバック手順

デプロイの参照バージョンを旧番号へ付け替えるだけで戻せる（URL不変のまま）:

```bash
clasp list-versions                     # 戻したいバージョン番号を確認
clasp update-deployment <deploymentId>  # 対象バージョンの指定方法は --help で確認
```

- コード自体の巻き戻しが必要なら git で該当コミットへ戻して push → create-version →
  update-deployment の通常フローを踏む。
- スクリプトプロパティやシートのデータはバージョン管理外。データに影響する変更を
  ロールバックする場合は人手判断を仰ぐ（release エージェントの失敗時ルール）。

## 人手必須の作業（自動化不能・environment.md の「人手」分類に対応）

| 作業 | いつ発生 | 操作 |
|---|---|---|
| Apps Script API 有効化 | 初回のみ | script.google.com/home/usersettings でオン |
| `clasp login`（OAuth同意） | 初回・認証切れ時 | ブラウザで承認 |
| 初回実行時のスコープ承認 | 初回デプロイ後 | 実行時に出る同意画面で承認 |
| **スコープ変更時の再承認** | `oauthScopes` を変更したリリース | 利用者側で再承認が必要になることを告知 |
| アクセス設定変更 | `webapp.access`/`executeAs` 変更時 | デプロイ設定の変更を承認 |
| スクリプトプロパティへのシークレット投入 | 初回・キー追加時 | エディタの プロジェクト設定 → スクリプト プロパティ |

## CI/CD（GitHub Actions + clasp）

GASでは GitHub Actions からの `clasp push` 自動化が定番。要点:

- **認証情報の扱い**: ローカルで `clasp login` して生成された `~/.clasprc.json` の内容を
  **GitHub Secrets**（例: `CLASPRC_JSON`）に保管し、ワークフロー内で
  `~/.clasprc.json` に書き出してから clasp を実行する。
  **`.clasprc.json` をリポジトリにコミットすることは絶対に不可**。
- ワークフロー生成は `skill-authoring` の「CI/CDワークフローの扱い」に従う
  （設計文書がCIを前提にするなら実体もその時点で作る）。
- 生成した `.github/workflows/` はハーネス保護フックの対象のため、以後の変更は
  人間レビュー経由になる。
- OAuthトークンは失効しうる。CIが認証エラーで落ちたら、ローカルで `clasp login` し直して
  Secretsを更新する（人手）。この運用手順をワークフロー導入時に README に書き残す。
