---
name: stack-conventions
description: Google Apps Script(GAS)開発の技術規約。V8ランタイム、clasp v3+TypeScriptローカル開発構成、実行時間・トリガー・UrlFetch等のクォータ、PropertiesService/LockService、HtmlService/google.script.runの非同期パターン。設計・実装エージェントがGASコードを設計/実装するときに必ず参照する。
---

# GAS技術規約スキル（stack-conventions）

このハーネスは技術スタックが **Google Apps Script（GAS）に固定** されているため、
本体ハーネスの「設計フェーズで動的作成」ではなく事前同梱している（DECISIONS.md GD03）。

> **裏取り情報**: 本スキルの数値・コマンドは 2026-07-06 に一次情報
> （developers.google.com/apps-script、github.com/google/clasp）で確認した値
> （出典の詳細は DECISIONS.md GD02）。クォータは予告なく改定されることがあるため、
> 設計判断がクォータ限界に近い場合は
> [公式クォータページ](https://developers.google.com/apps-script/guides/services/quotas)
> で最新値を再確認すること。

## ランタイム前提

- `appsscript.json` で `"runtimeVersion": "V8"` を明示する（モダンJS構文が使える）。
- `timeZone` はプロジェクトの利用者に合わせて明示する（例: `"Asia/Tokyo"`）。
  日時バグの典型原因のためデフォルトのまま放置しない。
- `oauthScopes` はマニフェストに**明示的に列挙**する（自動判定に任せない）。
  必要最小限のスコープのみ。スコープを追加・変更すると再デプロイ時に
  ユーザーの再承認（人手）が必要になることを設計段階から意識する。

## ローカル開発構成（clasp v3 + TypeScript）

**clasp v3 は TypeScript を自動トランスパイルしない**（v2からの破壊的変更）。
ローカルTS開発の標準構成は次のとおり。

1. `src/` に TypeScript を書き、バンドラ（esbuild または Rollup）で
   `dist/` に単一の `Code.js`（+ `appsscript.json`、HTMLファイル）を出力する。
2. `.clasp.json` の `rootDir` を `dist/` に向け、`clasp push` はビルド成果物だけを送る。
3. 型定義は `@types/google-apps-script`（devDependency）。
4. GASのグローバル関数（`doGet`/`doPost`/`onOpen`/トリガーハンドラ）は
   バンドル後もトップレベルに残る形にする（バンドラの設定で
   エントリポイント関数をグローバルへ露出させる。IIFE内に閉じ込めると
   GAS側から見えず「関数が見つかりません」になる）。
5. `npm run build && clasp push` を1コマンド（`npm run deploy:dev` 等）にまとめる。

```jsonc
// .clasp.json の例
{
  "scriptId": "<スクリプトID>",
  "rootDir": "dist"
}
```

## テスト容易性のためのコード分割（最重要規約）

GASは**ローカル実行できない**。したがって:

- **ビジネスロジックはGASサービス（SpreadsheetApp等）に依存しない純粋関数として
  `src/lib/` に分離**し、Node上でユニットテスト可能にする。
- GASサービス呼び出し（シート読み書き、UrlFetch、Properties）は薄いアダプタ層
  （`src/gas/`）に閉じ込め、ロジック層へはプレーンなデータだけを渡す。
- この分割はテスト2層構造（`test-case-design` スキルのGAS節）の前提になる。

## クォータ・制限（設計段階で必ず考慮する）

| 制限 | consumer (gmail.com) | Google Workspace |
|---|---|---|
| スクリプト実行時間 | 6分/回 | 6分/回 |
| カスタム関数 | 30秒/回 | 30秒/回 |
| トリガー合計実行時間 | 90分/日 | 6時間/日 |
| トリガー数 | 20/ユーザー/スクリプト | 同左 |
| 同時実行 | 30/ユーザー | 同左 |
| UrlFetch 呼び出し | 20,000回/日 | 100,000回/日 |
| UrlFetch レスポンス | 50MB/回 | 同左 |
| Properties | 9KB/値、500KB/ストア | 同左 |
| メール送信 | 100宛先/日 | 1,500宛先/日 |

設計上の帰結:

- **6分制限**: 大量データ処理は「継続トークンを Properties に保存して時間ベーストリガーで
  分割実行」パターンにする。1回で終わる前提の設計にしない。
- **バッチ読み書き**: シートへのアクセスはセル単位ループではなく
  `getValues()`/`setValues()` の一括操作にする（実行時間の主要因）。
- **Properties 9KB/値**: 大きなJSONを1キーに入れない。超えるデータはシートか
  Driveに置く。

## シークレット・設定値

- APIキー等のシークレットは **PropertiesService のスクリプトプロパティ** に保存し、
  コード・リポジトリには絶対に書かない（ハーネスの secret-leak フックの対象でもある）。
- 初回セットアップでスクリプトプロパティに値を入れる手順は README か
  `environment.md` に「人手作業」として明記する。

## 並行性（LockService）

複数ユーザー・複数トリガーから同時に書き込みが起きうる処理
（doPost、シート更新、カウンタ）は `LockService.getScriptLock()` で直列化する。

```js
const lock = LockService.getScriptLock();
lock.waitLock(30000); // 取得失敗時は例外
try {
  // 読み取り→判断→書き込み を1ロック内で行う
} finally {
  lock.releaseLock();
}
```

## UrlFetchApp

- `muteHttpExceptions: true` を指定し、ステータスコードを自分で判定する
  （既定では4xx/5xxが例外になりハンドリングが分岐する）。
- 呼び出し回数クォータ（上表）があるため、ポーリング設計では間隔と上限回数を明示する。
- 接続先を固定できる場合はマニフェストの `urlFetchWhitelist` で制限する（多層防御）。

## Webアプリ（HtmlService / google.script.run）

- エントリポイントは `doGet(e)` / `doPost(e)`。**必ず `HtmlOutput` または
  `TextOutput` を返す**。リクエスト情報は `e.parameter` / `e.parameters` /
  `e.postData.contents` から取る。
- サンドボックスは **IFRAME のみ**（NATIVE/EMULATED は廃止済み）。制約:
  - トップレベルのナビゲーション（リダイレクト）不可。リンクは
    `target="_top"` / `"_blank"` を付けるか `<head>` に `<base target="_top">` を置く。
  - スクリプト・外部CSS・XHR は HTTPS のみ。
- サーバ関数呼び出しは `google.script.run` の**非同期パターン**を必ず使う
  （戻り値は直接受け取れない）:

```js
google.script.run
  .withSuccessHandler(renderList)
  .withFailureHandler(showError)   // 省略しない。省略すると失敗が握り潰される
  .getRecords(query);
```

- 返せる型はプリミティブ・配列・プレーンオブジェクトのみ（Date や GASオブジェクトは
  そのまま返さず、文字列/数値に変換して返す）。
- HTML/CSS/JSの分割は `HtmlService.createTemplateFromFile()` + include パターンを使い、
  1ファイル肥大を避ける。UIモックアップ（`ui-design-mockup` スキル）の自己完結型HTMLは
  この形にほぼそのまま載せられる。
- CSP/サンドボックスの都合で動かないライブラリがありうるため、外部JSライブラリの採用は
  設計段階で「IFRAMEサンドボックス内で動く実績があるか」を確認してから決める。
- **利用者を特定チームに限定する場合**: `webapp.access` だけでは特定ユーザー集合に
  絞れない（`DOMAIN` はドメイン全体）。アプリ層のallowlist照合が必須で、
  その標準パターン（構成の判定表・全公開関数への認可チェック・参照実装）は
  `.github/skills/gas-access-control/SKILL.md` を正とする。

## ログ・デバッグ

- `console.log()` を使う（Cloud Logging に送られ、Apps Script エディタの
  「実行数」画面からも確認できる）。`Logger.log` より `console.*` を優先する。
- デプロイ済みWebアプリの不具合調査は `clasp tail-logs` またはエディタの実行数画面で行う。

## コンテナバインド vs スタンドアロン

| | コンテナバインド | スタンドアロン |
|---|---|---|
| 向く場合 | 特定のシート/ドキュメント専用ツール、onOpenメニュー、シンプルな運用 | 複数シートを扱う、Webアプリ主体、リポジトリ管理を綺麗にしたい |
| clasp | `clasp clone-script <scriptId>` でコード管理可能 | 同左（`clasp create-script` で新規作成可） |
| 注意 | コンテナ（シート）の複製とスクリプトの複製が連動する | シートへのアクセスは `SpreadsheetApp.openById()` でIDを明示 |

どちらにするかはプロジェクトごとの選択（`environment.md` で確定させる。
設計エージェントがトレードオフを提示する対象）。
