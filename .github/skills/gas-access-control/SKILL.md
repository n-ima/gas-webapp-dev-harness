---
name: gas-access-control
description: GAS Webアプリのユーザーアクセス制御(認可)の標準パターン。webapp.access/executeAsだけでは「特定チーム限定」ができないため、アプリ層のallowlist照合を標準化する。Session.getActiveUserの信頼性判定表、google.script.run公開関数への認可チェック適用、参照実装(references/access-control.js)を含む。設計・実装エージェントがWebアプリの利用者を絞るときに使う。
---

# GASアクセス制御スキル（gas-access-control）

## 目的：プラットフォームの穴を標準パターンで塞ぐ

GAS Webアプリの `webapp.access` には「特定のユーザー集合（チーム）に限定する」選択肢が
**存在しない**（`MYSELF`=自分のみ / `DOMAIN`=Workspaceドメイン**全体** /
`ANYONE`=全Googleユーザー / `ANYONE_ANONYMOUS`=匿名可）。
「経理チームだけ」のような限定は**アプリ層で自作するしかない**が、素朴に作ると
高確率で間違える領域のため、このスキルを正として標準化する。
データを共有するのではなく「作り」を標準化するのが目的。

> **裏取り情報**: 本スキルの挙動記述は 2026-07-06 に一次情報で確認した
> （[Session reference](https://developers.google.com/apps-script/reference/base/session)、
> [Client-to-server communication](https://developers.google.com/apps-script/guides/html/communication)、
> 詳細は DECISIONS.md GD09）。
> **判定表の各行は初回プロジェクトのテストフェーズで必ず実測確認し、
> 結果が異なればこのスキルを修正して learnings.md に記録する。**

## 手順1: 本人確認が成立する構成を選ぶ（判定表）

アプリ層のallowlist照合は「アクセスユーザーのメールアドレスが確実に取れること」が
前提。これは `executeAs` とアカウント種別の組み合わせで決まる（公式ドキュメントの
明記事項: `getActiveUser().getEmail()` は「execute as me（=USER_DEPLOYING）のWebアプリ」
では空文字。**ただし開発者自身または同一Google Workspaceドメインのユーザーには
この制限が適用されない**）。

| 要件・状況 | 推奨構成 | 本人メール | 備考 |
|---|---|---|---|
| **Workspaceドメイン内のチーム限定**（このスキルの主対象） | `access: DOMAIN` + `executeAs: USER_DEPLOYING` + allowlist照合 | 取得可（同一ドメイン例外） | データはデプロイ者権限で読むためシートの個別共有は不要。DOMAINが第1関門、allowlistが第2関門の二段構え |
| consumer(gmail)アカウント間・複数ドメイン横断のチーム限定 | `access: ANYONE` + `executeAs: USER_ACCESSING` + allowlist照合 | 取得可（ユーザー自身が承認するため） | データアクセスが**アクセスユーザーの権限**になる。シート等を各利用者に共有する必要があり、利用者はシートを直接開ける（下のトレードオフ参照） |
| 完全公開（誰でも） | `ANYONE_ANONYMOUS` | 不要 | allowlist不要。入力値検証と書き込み保護を厚くする |
| consumer + `USER_DEPLOYING` + `ANYONE` | **メールallowlist不可**（getActiveUserが空文字） | 取得不可 | この構成でチーム限定が必要なら構成自体を上2行のどちらかへ変える。URLトークン等の代替は「リンクを知っている人全員」と等価な弱い認可のため**既定では採用しない** |

### USER_ACCESSING 構成のトレードオフ（採用前にユーザーへ明示）

- 利用者ごとに初回のスコープ承認が発生する（人手・environment.mdの分類どおり）。
- データリソース（シート等）を利用者に共有する必要がある。その結果、
  **利用者はアプリを経由せずシートを直接開ける**。「アプリのUIでだけ操作させたい」
  「一部の列は見せたくない」が要件にあるなら、この構成では満たせないため
  Workspace + USER_DEPLOYING 構成を提案する。

## 手順2: 実装の鉄則（参照実装: `references/access-control.js`）

1. **デフォルト拒否**: メールが取得できない（空文字）場合は必ず拒否する。
   許可ではなく拒否に倒すことで、構成ミス（判定表と違うデプロイ設定）も検知できる。
2. **`doGet` だけでなく、`google.script.run` で公開する全サーバ関数の先頭で
   `requireAuth_()` を呼ぶ**。`google.script.run` は doGet を経由せず各関数を直接
   呼べるため、doGetだけのチェックは認可バイパスになる（最頻出の作り間違い）。
3. **内部関数は名前を `_` で終わらせて非公開化する**。`_` で終わる関数と
   ライブラリ内・非トップレベルの関数は `google.script.run` から呼べない（公式明記）。
   公開関数は「requireAuth_() + 内部関数への委譲」だけの薄い層にする。
4. **メール比較は trim + 小文字正規化**してから行う。
5. **未許可時の応答にデータを含めない**（定型メッセージのみ。存在有無も漏らさない）。
6. **allowlistの置き場所**: 少人数・変更が少ないなら**スクリプトプロパティ**
   （`ALLOWED_EMAILS` にカンマ区切り。9KB/値の制限に注意）。運用者が頻繁に
   変えるなら**管理用シート**（デプロイ者のみ編集可にする）。どちらを選んだかを
   `environment.md` に記録する。
7. **拒否をログに残す**（`console.warn`。Cloud Loggingで追跡できる）。

## 手順3: テスト観点（test-plan.md に必ず含める）

- **許可ユーザー**: 全主要フローが動く。
- **非許可ユーザー**: doGet で定型拒否画面になり、**公開サーバ関数を直接呼んでも**
  例外で拒否される（doGet経由だけの確認で済ませない）。
- **メール取得不能ケース**: allowlistを空にする等で「取得不能→拒否」に倒れることを確認。
- **網羅性レビュー**: トップレベルの関数一覧を列挙し、`doGet`/`doPost` と
  `requireAuth_()` で始まる公開関数、`_` 終わりの内部関数**以外が存在しない**ことを
  確認する（reviewer / security-review の確認項目に含める）。

## 要件定義・設計フェーズとの接続

- 要件定義: `environment.md` の「アクセス制御方式」「allowlistの管理場所」を埋める。
  「誰が使うか」だけでなく「使えてはいけないのは誰か」を聞き切る。
- 設計: 判定表から構成を決め、ADRに「なぜその access×executeAs か」を残す。
  USER_ACCESSING 構成を選ぶ場合は上記トレードオフをユーザーに明示して選んでもらう。
