/**
 * GAS Webアプリ用アクセス制御の参照実装（gas-access-control スキル）。
 *
 * 前提: 本人メールが取得できる構成でデプロイされていること（SKILL.md の判定表を参照。
 * 例: Workspaceドメイン内なら access: DOMAIN + executeAs: USER_DEPLOYING）。
 *
 * 使い方:
 * - このファイルをプロジェクトの src/ にコピーし、公開する全サーバ関数の先頭で
 *   requireAuth_() を呼ぶ。
 * - 内部処理は必ず名前が _ で終わる関数に置く（google.script.run から呼べないため、
 *   認可チェックを通らない入口が構造的に存在しなくなる）。
 */

/**
 * 許可メール一覧（trim済み・小文字）を返す。
 * 置き場所は2択（environment.md に記録する）:
 * - スクリプトプロパティ ALLOWED_EMAILS（カンマ区切り。少人数・変更少ない場合）
 * - 管理用シート（運用者が頻繁に編集する場合。デプロイ者のみ編集可にする）
 */
function getAllowedEmails_() {
  const raw =
    PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '';
  return raw
    .split(',')
    .map(function (s) {
      return s.trim().toLowerCase();
    })
    .filter(Boolean);
}

/** アクセスユーザーのメール（取得できない構成・状況では空文字）。 */
function getCurrentEmail_() {
  return (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

/**
 * 認可判定。デフォルト拒否:
 * メールが取得できない場合は必ず false（デプロイ構成が判定表とずれている場合の検知を兼ねる）。
 */
function isAuthorized_() {
  const email = getCurrentEmail_();
  if (!email) return false;
  return getAllowedEmails_().indexOf(email) !== -1;
}

/**
 * 公開サーバ関数（google.script.run で呼ばれる関数）の先頭で必ず呼ぶ。
 * 未許可なら例外で処理を中断する。この1行が無い公開関数はレビューで差し戻し対象。
 */
function requireAuth_() {
  if (!isAuthorized_()) {
    console.warn(
      'access denied: ' + (getCurrentEmail_() || '(email unavailable)')
    );
    throw new Error('このアプリへのアクセス権がありません。管理者に連絡してください。');
  }
}

// ---------------------------------------------------------------- 使い方の例

/** Webアプリのエントリポイント。未許可時はデータを一切含まない定型画面を返す。 */
function doGet(e) {
  if (!isAuthorized_()) {
    return HtmlService.createHtmlOutput(
      '<p>このアプリへのアクセス権がありません。管理者に連絡してください。</p>'
    );
  }
  return HtmlService.createTemplateFromFile('index').evaluate();
}

/**
 * google.script.run から呼ばれる公開関数の例。
 * 「requireAuth_() + 内部関数への委譲」だけの薄い層にする。
 */
function getRecords(query) {
  requireAuth_();
  return fetchRecords_(query); // 実処理は _ 終わりの内部関数へ
}
