---
name: gas-access-control
description: GAS Webアプリのユーザーアクセス制御(認可)の標準パターン。webapp.access/executeAsだけでは「特定チーム限定」ができないため、アプリ層のallowlist照合を標準化する。Session.getActiveUserの信頼性判定表、google.script.run公開関数への認可チェック適用、参照実装(references/access-control.js)を含む。設計・実装エージェントがWebアプリの利用者を絞るときに使う。
---

このスキルの本文の正は `.github/skills/gas-access-control/SKILL.md` です。
それを読み、その手順・チェックリストに従ってください(このファイルはClaude Codeが
`.claude/skills/` しか探索しないために置いてある薄いポインタです)。
