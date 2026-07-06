---
description: '要件定義書をもとにGAS前提のアーキテクチャ設計書を作成する（GAS内の選択はトレードオフ提示）'
---

このコマンドは薄いアダプタです。振る舞いの正は参照先にあります。

1. `.github/agents/design.agent.md` を読み、その役割定義に従ってこの会話のロールを設定してください。
2. その上で `.github/prompts/03-design-architecture.prompt.md` の本文の指示を実行してください。
3. 役割定義の中の `runSubagent` は、Claude Code では **Task ツール**で
   `.claude/agents/` の同名サブエージェント(reviewer / task-worker / spec-critic)を
   呼ぶことに読み替えてください。ハンドオフボタンは存在しないため、フェーズ移行の案内は
   「新しいセッションで /<コマンド名> を実行」の形にしてください。
