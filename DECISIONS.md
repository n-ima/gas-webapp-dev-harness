# DECISIONS.md — このハーネス自体の設計判断ログ

これは `docs/02-design/adr/`（**生成するアプリ**の設計判断）とは別物で、
**このハーネス自体**がなぜ今の形になっているかを記録するものです。
今後ハーネスを改修する人（自分自身を含む）が、同じ議論を繰り返したり、
一度直したバグを再導入したりしないようにするための記録です。

最終更新: 2026-07-06

各項目は「決定」「根拠・出典」「捨てた選択肢」の順で書く（`docs/02-design/adr/adr_template.md` と
同じ形式を踏襲）。

## 系譜（このリポジトリの出自）

**本リポジトリ（gas-webapp-dev-harness）は copilot-sdlc-harness（コミット a8d540e）からの
派生であり、本体の D001〜D027 の決定をすべて継承する。** D001〜D027 は本体で決定された
内容の写しであり、以後の本体側の変更はここには自動反映されない。

- **特化方針**: 構造的な不変部分（agents/hooks/prompts/skillsの骨格、フェーズゲート、
  成長ループ、セキュリティガードレール、3プラットフォーム対応のアダプタ層）は変えず、
  GAS（Google Apps Script）特化は「追記と事前確定」だけで行う（databricks-job-dev-harness と
  同じ「コピーして特化」方式）。
- **本リポジトリ固有の決定は GD01〜 と番号付けし、本体の D 系列と区別する**（本文末尾）。
- **同期方針**: 派生→本体は改善指示書（handover文書）方式で人間が還流する。
  本体→派生は、本体側の汎用改善（D028以降）を定期的にレビューして手動で再適用する。

---

## D001: chatmode.md ではなく custom agents(.agent.md) を採用

- **決定**: `.github/chatmodes/*.chatmode.md` ではなく `.github/agents/*.agent.md` を使う。
- **根拠**: VS Code公式ドキュメントで「custom chat modes は custom agents に名称・仕様変更され、
  `.chatmode.md` は非推奨。`.agent.md` にリネームして使う」と明記されている
  ([VS Code Docs: Custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents))。
  最初のバージョンは学習知識だけで `.chatmode.md` を使っており、実際に調べ直して判明した誤り。
- **捨てた選択肢**: `.chatmode.md` のまま運用（非推奨のため不採用）。

## D002: Agent Skills(SKILL.md) の採用

- **決定**: 要件引き出し・ADR作成・テストケース設計・ゲート判定などの手順を
  `.github/skills/*/SKILL.md` として部品化する。
- **根拠**: VS Code / Copilot CLI / Copilot cloud agent 横断の公開標準（agentskills.io）として
  Agent Skills が存在し、`name`/`description` だけを常時読み込み、本文は関連時のみ読み込む
  「段階的開示」でコンテキスト消費を抑える設計になっている
  ([VS Code Docs: Agent Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills))。
  当初はこの仕組みの存在自体を見落としていた。
- **捨てた選択肢**: 手順をすべて各エージェントファイルの本文に書く（肥大化し、他エージェントから
  再利用できない）。

## D003: Agent Hooks による機械的なゲート強制

- **決定**: `.github/hooks/*.json` + シェルスクリプトで、指示だけでは守られない可能性がある
  ルール（テンプレ直接編集の禁止、危険なgit操作の確認、ハーネス設定自体の保護、
  シークレットのハードコード検知）を機械的に強制する。
- **根拠**: 最初のハーネスは「LLMが指示を守ってくれることを祈るだけ」の強制力ゼロの構成だった
  という指摘を受け、VS Code公式のAgent Hooks（Preview機能）を調査して採用
  ([VS Code Docs: Agent hooks](https://code.visualstudio.com/docs/agent-customization/hooks))。
- **注意**: Preview機能であり、stdin/stdoutのペイロード形状は将来変わりうる。
  スクリプトはパース失敗時に安全側（許可）に倒す設計にしている。

## D004: reviewer サブエージェントによる別セッションレビュー

- **決定**: `test` エージェントは全テスト成功後、リリースに進む前に必ず `runSubagent` で
  `reviewer`（読み取り専用・独立コンテキスト）を1回呼び出す。
- **根拠**: 「実装した本人がそのまま自己レビューして自己承認する」バイアスを避けるため、
  独立したコンテキストでのレビューが公式に推奨されている
  ([VS Code Docs: Subagents](https://code.visualstudio.com/docs/agents/subagents) の
  code-reviewサブエージェント例)。ユーザーからの「レビューは別セッションで行った方がよい」
  という指摘とも一致し、それが単なる思い込みではなく公式ベストプラクティスであることを確認した。
- **捨てた選択肢**: 並列の多視点レビュー（正しさ用・セキュリティ用・品質用を別々に並列実行）は
  精度は上がるがモデル呼び出し回数が視点の数だけ増えてコストが積み上がるため、既定では不採用。
  プロジェクトの重要度に応じてユーザーが明示的に要求した場合のみ有効にする。

## D005: security-review Skill は公式のものを取り込む

- **決定**: セキュリティレビューの手順をゼロから書かず、`github/awesome-copilot` の公式
  `security-review` Skillを参考にして `.github/skills/security-review/SKILL.md` を作成した。
- **根拠**: ユーザーからの「公式のSkillがあれば採用する」という方針に基づき、
  8ステップの手順（スコープ確定→依存監査→シークレットスキャン→脆弱性深掘り→
  クロスファイル解析→自己検証→レポート作成→修正案提示、ただし自動適用はしない）を
  このハーネスのドキュメント構成に合わせて適合させた。
- **横展開**: `skill-authoring` Skill内に「ゼロから書く前に公式/コミュニティ製Skillの
  流用を優先する」という手順として一般化した（デプロイ環境Skill・スタック規約Skillにも適用）。

## D006: ハーネス自体の設定ファイルへの自動編集を禁止

- **決定**: `.github/agents/`, `.github/hooks/`, `AGENTS.md`, `plugin.json`,
  `.vscode/settings.json` へのエージェントによる自動編集を `security-hooks.json` でdenyする。
  `.github/skills/` は動的追加を許すため対象外。
- **根拠**: プロンプトインジェクション等による自己権限昇格・ガードレール解除を防ぐという
  セキュリティガードレールの要求に対応。`.github/CODEOWNERS` テンプレートとブランチ保護の
  組み合わせも合わせて推奨。

## D007: 呼び出し頻度が高いエージェントは `model: auto`

- **決定**: `orchestrator` / `implement` / `test` / `task-worker` は `model: auto`。
  `design` / `release` / `reviewer` はモデルを固定せず、必要に応じてユーザーが強いモデルに
  切り替えることを推奨する（本文にその旨を明記）。
- **根拠**: GitHub Copilotは2026年6月からトークン量に応じた従量課金（GitHub AI Credit）に
  移行しており、「利用可能な中で最も安価なモデルを自動選択するAuto」には追加の割引もある。
  一方、設計判断やレビューの誤りは手戻りコストの方が高くつくため、そこだけは強いモデルを
  検討する価値がある、という非対称な扱いにした。

## D008: プロンプトファイルは `agent:` で明示的にバインドする

- **決定**: `.github/prompts/*.prompt.md` の frontmatterから、旧来の `mode: 'agent'` /
  `tools: [...]` を削除し、`agent: <name>` で対応するCustom Agentに明示的にバインドした。
- **根拠**: 実際に使い方ドキュメントを書きながらシナリオを検証した際に、
  「`agent:` を指定しない場合、プロンプトは選択中の別エージェント/既定モードのツール制限の
  ままで実行される」という仕様（[VS Code Docs: Prompt files](
  https://code.visualstudio.com/docs/agent-customization/prompt-files)）を確認し、
  最初のバージョンではこのバインディングが漏れていたことが判明した。
  これは「ユーザーに言われたから直した」のではなく、シナリオ検証で見つけた実装ミス。

## D009: orchestrator に `edit` 権限を付与（progress.md初回作成のため）

- **決定**: `orchestrator` の `tools` に `edit` を追加。ただし「未着手/進行中」への機械的な
  更新はそのまま行ってよいが、「完了(done)」への変更は必ずユーザー承認を要する、という
  区別を本文に明記。
- **根拠**: 実際にシナリオを辿って検証した際、`orchestrator` が読み取り専用のままだと
  初回起動時に `docs/00-overview/progress.md` を作成できない（`gate-check` Skillの
  「無ければ作成する」という指示を実行する権限がない）というバグを発見した。

## D010: reviewer の発見事項を test-report.md / security-review-report.md に転記する

- **決定**: `reviewer` は読み取り専用（`edit`ツールなし）のため、発見事項をファイルに残すのは
  呼び出し元の `test` エージェントの責務であると明記し、`docs/04-test/security_review_report_template.md`
  を新設した。
- **根拠**: シナリオ検証で「独立レビューの結果が記録に残らず消えてしまう」抜けを発見した
  （全自動区間だからといって人が後から確認できなくなってよいわけではない）。

## D011: 実装ループを `task-worker` サブエージェントに分割（コンテキストロット対策）

- **決定**: `implement` エージェントはコードを直接書かず、タスク1つにつき1回
  `runSubagent` で `task-worker`（独立コンテキスト）を呼び出す方式に変更した。
- **根拠**: Anthropicの公式エンジニアリングブログ
  ([Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
  で報告されている "context rot"（会話が長くなるほど想起精度が落ちる現象）への対策。
  「1タスク1セッション」という経験則は、この現象に対する合理的な対策であることを確認した。
  ユーザーからの疑問がきっかけで調査し、既存の設計（全タスクを1つの会話でノンストップ実装）が
  この観点で弱点であることが判明したため修正した。
- **横展開**: フェーズ間・フェーズ内でも「会話が長くなってきたら新しいセッションを始めて
  `docs/` を読み直す」という原則をAGENTS.md/USAGE.mdに明文化した
  （ドキュメントが記憶であり、会話が記憶ではない、という設計思想の言語化）。

## D012: Hooksスクリプトの実機バグ2件を修正

- **決定/修正内容**:
  1. `guard-secret-leak` の正規表現が、VS CodeのフックペイロードがJSON文字列として
     引用符を `\"` にエスケープすることを考慮しておらず、典型的な `api_key = "..."` の
     漏洩パターンを検知できていなかった。エスケープされた引用符も許容するよう修正。
  2. Windows PowerShell 5.1 は `.ps1` ファイルがBOMなしUTF-8だと日本語文字列を誤読し、
     全PowerShell版フックがパースエラーで起動不能だった。全 `.ps1` をBOM付きUTF-8で
     保存し直して解決。
- **根拠**: 「実機で動かして確認したか」という指摘を受け、実際にbash/PowerShellでhookスクリプトに
  サンプル入力を与えて検証した結果、上記2件が実際に動かないことを確認した
  （机上のレビューだけでは見つからなかった）。
- **教訓**: 日本語（非ASCII）を含むテキストをWindows向けスクリプトに埋め込む場合、
  BOM付きUTF-8での保存を徹底する。JSON経由のペイロードを正規表現で扱う場合、
  エスケープされた引用符を考慮する。

## D013: Playwright（ブラウザ動作確認）をテストフェーズに組み込み

- **決定**: 生成するアプリがブラウザベースのUIを持つ場合、`test` エージェントは
  ユニット/結合テストに加えて、Microsoft公式の Playwright MCP サーバー
  （`@playwright/mcp`）を `.vscode/mcp.json` に追加し、実際にページを表示・操作して
  確認する手順を `test-case-design` Skillに追加した。
- **根拠**: ユーザーからの「ブラウザで確認できるものはPlaywrightも使って表示や動作確認を行う」
  という要求に基づき、Microsoft公式のPlaywright MCPサーバー
  ([microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)) の存在と
  VS Codeでの設定方法を確認した上で採用。
- **設計判断**: ハーネス自体には（このテンプレートにはUIが無いため）`.vscode/mcp.json` を
  事前に用意せず、設計フェーズでUIありと判明した時点でテストエージェントが動的に追加する
  （D005の「動的Skill/設定は判明した時点で作る」という方針と一貫させた）。

## D014: ゲート陳腐化検知フックの追加

- **決定**: 承認済み（GATE_STATUSが `done`）のフェーズに対応するファイル
  （`requirements.md`, `architecture.md`, `tasks.md`, `test-report.md`,
  `release-checklist.md`）が編集された場合、`PostToolUse` フックで
  「承認済みだが編集された。後続フェーズとの整合を確認すること」という
  非ブロッキングの `systemMessage` を出す。
- **根拠**: 「要件や設計を手動で直して続けてよいか」という質問に対し、
  「ファイル編集自体は安全（各エージェントは会話ではなくファイルを読み直す設計のため）だが、
  承認後に変更すると下流フェーズとの整合が自動チェックされないままになる」という
  非対称性があったため、機械的なリマインダーを追加して補強した。

## D015: 要求文にEARS記法を採用

- **決定**: `requirements-elicitation` Skillと要件定義書テンプレートに、EARS
  （Easy Approach to Requirements Syntax）記法・INVEST基準・品質特性シナリオ
  （刺激→環境→応答→応答測定の定量NFR）・前提/リスク台帳を追加した。
- **根拠**: EARSはRolls-Royce発で[Airbus/NASA/Intel/Bosch等が採用](https://alistairmavin.com/ears/)する
  業界標準の要求構文であり、AWSのspec駆動開発IDE「Kiro」も中核に採用している。
  「要件定義の専門性が高度なレベルか」という問いに対し、Given/When/Thenだけでは
  要求文自体の曖昧さ（「適切に」「なるべく」等）を排除する仕組みが無かったため補強した。
- **捨てた選択肢**: ISO/IEC/IEEE 29148の完全準拠テンプレート（重すぎて対話型の
  要件定義の良さを損なう。EARSは軽量で訓練コストが低いことが採用理由）。

## D016: spec-critic サブエージェント（上流の独立レビュー）

- **決定**: `reviewer`（コード）と同じ「別セッションでの独立レビュー」パターンを
  要件定義・設計のゲート承認前にも適用する `spec-critic` サブエージェントを新設した。
  既定のサブエージェント経路は4つ（requirements→spec-critic, design→spec-critic,
  implement→task-worker, test→reviewer）になった。
- **根拠**: 欠陥の修正コストは下流ほど大きい（要件の欠陥が実装後に見つかると
  手戻りが最大になる）ため、独立レビューの費用対効果が最も高いのは上流。
  呼び出しは各ゲート1回に限定し、コスト増を最小にしている。

## D017: 成長ループ（learnings / retrospective / 本体還流）

- **決定**: 「使うたびに賢くなるハーネス」を実現する3層の記録構造を導入した。
  1. `docs/00-overview/learnings.md` — 訂正・失敗の都度1行追記する教訓ログ。
     SessionStartフックが自動注入するため、書けば以後の全セッションに確実に効く。
  2. `docs/06-retrospective/` + `/10-retrospective` — リリース後の構造化された振り返り。
     摩擦を「ハーネス改善/プロジェクト固有/一過性」に分類し、改善提案表を作る。
  3. 本体還流 — 改善提案と再利用可能Skillをハーネス本体リポジトリに人間が適用し、
     DECISIONS.mdに根拠つきで記録する。以後の新プロジェクトは改善済みから始まる。
- **根拠**: learnings.md（教訓ファイル）の蓄積は自己改善エージェントの確立された
  パターン。ポイントは「記録が実際に次の入力になる」機構で、
  単に書くだけでなくSessionStartフックでの自動注入まで実装した（注入されない記録は
  存在しないのと同じ）。ハーネス本体はテンプレートとして各プロジェクトにコピーされるため、
  プロジェクト内の学びを本体に還流する明示的な経路（振り返り→改善提案表→人間による適用）を
  定義した。ハーネス設定はセキュリティ上自動編集禁止（D006）のため、還流の適用は
  意図的に人間の作業としている。

## D018: databricks-job-dev-harness検証からの還流（第1弾・A項目群）

- **出典**: 派生ハーネス databricks-job-dev-harness の構築・E2E検証第1回
  （daily-sales-report-trial）からの改善指示書（CreateAppl-improvement-handover.md）。
  **D017の成長ループが実際に一周した最初の実例**。ユーザーの明示指示のもと適用した。
- **適用した項目と根拠**:
  - **A-1 PreCompact再注入**: コンテキスト圧縮でSessionStart注入分（GATE_STATUS・教訓）が
    失われる穴を塞ぐ。inject-progressをイベント引数化しPreCompactにも登録。実機検証済み。
  - **A-2 教訓トリガー拡張（最重要）**: E2E実測で「試行錯誤の末に確立した実行方法が
    記録されず、別セッションで同じ試行錯誤が再発」した欠陥への対策。実行方法の獲得知識を
    仕様の教訓より優先して記録するルールをAGENTS.md/learnings_template/
    retrospectiveスキル/test/releaseに追加。
  - **A-3 ナビゲーション責務**: 操作手順の暗記前提はスケールしない。全エージェントが
    「次の一手」を案内する責務をAGENTS.mdに、入口表を `harness-guide` スキルに、
    ヘルプを `/98-harness-help` に実装。
  - **A-4 セッション分割基準の数値化**: USAGE.mdに表（フェーズ別+継続中の4条件:
    完了タスク10個超/差し戻し2往復超/劣化を感じた/中断）。implementに10タスク超での
    新チャット提案を追加。
  - **A-5 起動経路の等価性ルール+全プロンプト監査**: ハンドオフ経由では.prompt.mdが
    読まれないため「振る舞いの正は.agent.md、プロンプトは薄い起動指示」をAGENTS.mdに
    明文化。監査の結果、00（番号規則→harness-guideへ）/01（memo不在時の対応→
    requirementsへ）/04（詳細設計の項目リスト→designへ）/05（粒度・紐づけ→implementへ）
    を移設し、該当プロンプトを薄化。02/03/06-10/99は問題なし。
    権限整合も点検し、実行不能な指示は検出されなかった。
  - **A-6 差分駆動の原則+ホットフィックス乖離追跡**: 「要件・設計を後から修正する場合」
    節を4分類に拡張。緊急対応は「絶対禁止」ではなく「記録すれば許容」に倒す
    （禁止すると障害時に必ず破られ、破られたルールは記録すらされないため）。
  - **A-7 横断整合監査**: gate-checkスキルに成果物間の食い違い検出（Spec Kitの
    /speckit.analyze相当）を追加。前回比較（D015前後）で認識していたSpec Kit劣位点の解消。
  - **A-8 workflows保護**: guard-harness-config-editの保護対象に .github/workflows/ を
    追加（CI/CDもガードレールの一部）。実機検証済み。
  - **A-9 .gitattributes+BOM規則**: Windows(autocrlf)でのクローンで.shがCRLF化して
    フック全滅する事故と、.ps1のBOM欠落事故（D012・派生版でも再発）の再発防止。
  - **A-10 ZIP配布手順**: 入手3経路をUSAGEに明記。`git archive`による安全なZIP作成と
    「向き先」事故（受領者がハーネス本体へ誤push）の防止。
  - **A-11 適用範囲+PRテンプレート**: READMEに「使うべき場面・使うべきでない場面」を明記
    （過剰さへの一番の防御は対象外の作業に使わせないこと）。トレーサビリティ・
    検証・安全性・rollbackを含むPRテンプレートを追加。

## D019: databricks検証からの還流（B項目群・Databricks固有を汎用化）

- **B-1 reviewer頻出指摘の前倒し**: SQL文字列直接連結・異常系の例外任せを
  task-workerの禁止事項に昇格（レビューで検出できるが実装時点で止める方が安い）。
  「reviewerで2回以上出た同種指摘は禁止事項へ昇格提案」の運用ルールを
  retrospectiveスキルに追加。
- **B-2 環境前提の実機確認**: environment.md記載を鵜呑みにしてゲート通過→実装で
  大幅手戻り、というE2E実測欠陥への対策。spec-criticの観点を「実機確認済みか」まで
  強化し、releaseに着手時の疎通確認を追加。
- **B-3 cold start対策の標準化**: 外部サービス依存テストはタイムアウト付きポーリングを
  標準とする（単発即時応答のassertは偽陰性を生む。実測）。test-case-designに追加。
- **B-4 冪等な初期化**: deploy Skillに前提リソースの冪等な初期化手順を必須化
  （「デプロイは成功するが初回実行で落ちる」の典型原因。実測）。skill-authoringに追加。
- **B-5 MCPはHooks検査対象外**: Hooksはネイティブコマンド文字列しか検査できず、
  MCPツール呼び出しはすり抜ける。最小権限の原則をAGENTS.mdセキュリティ節に明記。

## D020: test→releaseの send:true を維持（C-1の判断）

- **決定**: Databricks版は「リリース=重い本番承認」のため send:false に変更したが、
  CreateAppl は environment.md 駆動の自動リリース（ノンストップ設計）が
  アイデンティティであるため **send:true を維持**する。
- **整合**: USAGE.mdのセッション分割表には「リリース: 自動継続（ノンストップ設計）。
  手動で再開する場合は新チャット+/09でも同じ動作」と記載し矛盾をなくした。
  破壊的操作の確認はHooks（ask）とenvironment.mdの人手分類で担保される。

## D021: CIワークフローは設計フェーズで生成する（C-2の判断）

- **決定**: CreateApplはスタック非依存のため具体的なCIを同梱できない。選択肢(a)の
  プレースホルダ同梱ではなく **(b)「設計フェーズでスタック確定後に skill-authoring で
  生成する」を明文化** した（skill-authoringにCI/CDの扱い節を追加）。
- **原則**: 「参照される仕組みには実体を同梱するか、無いことを明記する」は採用。
  プレースホルダを置かない理由は、TODOだけのworkflowはCIが通っている錯覚を生むため。

## D022: E2E検証用サンプルの同梱は保留（C-3の判断）

- **決定**: Databricks版で大きな効果があったsamples/（検証フィクスチャ）の
  CreateAppl版は、**次にCreateAppl自体のE2E検証を実施するタイミングで作成する**として保留。
- **理由**: フィクスチャは実際にE2Eを回して初めて価値が出る（Databricks版の効果も
  検証実行とセット）。作る際は「本体リポジトリ上で検証しない。配布経路で作った
  使い捨てプロジェクトで行う」という検証運用ルールを必ず併記する。

## D023: UIデザインゲート（ui-design-mockup）の新設

- **決定**: ブラウザUIを持つアプリでは、設計フェーズで主要画面を自己完結型HTML
  モックアップ（`docs/02-design/ui/`、ダブルクリックで表示可能）として作成し、
  ユーザーの視覚確認を設計ゲート承認の前提条件とする。spec-criticはUIありなのに
  モックアップ無しをMAJOR指摘し、testはPlaywrightスクリーンショットとモックアップの
  乖離を検出する。
- **根拠**: 実際のハーネス利用で「実装後に画面デザインが考慮されていないと判明」する
  事象が発生。調査の結果、2026年の業界到達点は「Requirement → Design（インタラクティブな
  HTMLプロトタイプを視覚レビュー）→ Plan → Code → Verify」であり、モックアップは
  別ツールではなく**コードと同じワークスペースのファイルとして同じエージェントが
  生成・反復する**形が最新（superdesign等）。Spec Kit・BMADには視覚デザインゲートが無く、
  この領域は本ハーネスの差別化点になる。
- **コスト設計**: 生成は1画面1回のモデル呼び出し、**閲覧はブラウザで開くだけで
  トークンコスト・ゼロ**。全画面ではなく主要フロー+代表画面に絞る。修正はチャット指示と
  HTML直接編集の両方を受け付ける（ユーザーの提案どおり）。UIの無いアプリではスキップ。
- **捨てた選択肢**: Figma MCP連携を既定にすること（外部サービス依存・認証が必要で、
  汎用テンプレートの既定にはできない。Figmaを使うプロジェクトでは設計フェーズで
  接続すればよい）。


## D024: 次の一手の案内はプロンプトコマンド形式に統一

- **決定**: フェーズ移行時の案内を「新しいチャットで `/03-design-architecture` を実行」の
  ようなコマンド形式に統一し、「◯◯エージェントに切り替えて」という案内を禁止した。
  ハンドオフボタンは「同一チャット続行用」と位置づけ、ラベルにも
  「（このチャットで続行）」と明示。requirements/designのゲート後案内も
  コマンド形式を第一とし、ハンドオフを補足に格下げした。
- **根拠**: CreateApplの実機E2Eで実測された案内の不正確さ。要件定義完了時に
  「新しいチャットを開き、designエージェントに切り替えてから設計フェーズを開始」と
  案内された。(1) プロンプトは `agent:` バインドで自動的に正しいエージェントとして
  動くため手動切り替えは不要、(2) エージェント切り替えだけではプロンプトの起動指示
  （どの段階から始めるか）が実行されない、(3) ハンドオフ（同一チャット継続）と
  セッション分割表（新規チャット推奨）が矛盾したまま両方を混ぜた案内になっていた、
  の3点が原因。案内フォーマットの規定（AGENTS.mdナビゲーション責務・harness-guide）と
  ゲート後案内の書き換えで解消した。

## D025: マルチプラットフォーム対応（Copilot / Claude Code / Antigravity）

- **決定**: 「正のレイヤ + 薄いアダプタ」構成で3環境対応した。振る舞いの正は従来どおり
  `AGENTS.md` + `.github/`（agents/prompts/skills/hooks）に一本化し、各環境には
  ポインタだけのアダプタを置く（生成スクリプトで機械生成・冪等）。
  - Claude Code: `CLAUDE.md`（`@AGENTS.md`インポート）、`.claude/commands/`（13件）、
    `.claude/agents/`（reviewer/spec-critic/task-worker）、`.claude/skills/`（9件のポインタ）、
    `.claude/settings.json`（既存フックスクリプトをClaude Codeスキーマで配線）
  - Antigravity: `AGENTS.md` を直接読む + `.agents/workflows/`（13件）
- **調査根拠**（2026年7月時点の一次情報）:
  - Claude Code は AGENTS.md を直接サポートせず（[issue #31005](https://github.com/anthropics/claude-code/issues/31005)、
    3000超のupvoteに未対応）、スキルも `.claude/skills/` しか探索しない
    （`.agents/skills/` へのsymlinkは内部ファイル汚染で機能しない）。
    そのため CLAUDE.md のインポート機能とポインタスキルで橋渡しする。
  - Claude Code のフック（`.claude/settings.json`）はVS Code版と同一のペイロード仕様
    （tool_input.file_path/command、hookSpecificOutput.permissionDecision）のため、
    **既存スクリプトを無変更で共用**できる（VS CodeがClaude Code形式を採用した経緯による）。
    Claude Code の SessionStart は compaction 後にも発火する（source=compact）ため、
    PreCompact 相当の再注入も SessionStart 登録だけでカバーされる。
  - Antigravity は v1.20.3 でプロジェクトレベルの AGENTS.md を正式サポート。
    `.agents/` が特別ディレクトリで、`.agents/workflows/*.md` が /コマンドになる
    （[Google Codelabs](https://codelabs.developers.google.com/autonomous-ai-developer-pipelines-antigravity)）。
    フック機構は無いため、ガードレールは指示レベル+Git保護に縮退する（対応表に明記）。
- **設計原則**: アダプタは振る舞いを持たない（起動経路の等価性ルールA-5の
  プラットフォーム拡張）。読み替え規則（runSubagent→Task/別会話）はアダプタ内と
  AGENTS.mdに明記。ガードも拡張し、アダプタ層（CLAUDE.md/.claude設定・agents・
  commands/.agents/workflows）を保護対象に追加（`.claude/skills/` は動的Skill作成の
  ため除外）。skill-authoringに「正のスキル新設時はClaude用ポインタも同時作成」を追加。
- **捨てた選択肢**: (a) 各環境に振る舞いをコピーする（必ずドリフトする）。
  (b) Claude Codeプラグイン化（インストール手順が増え、テンプレートのクローン即利用に反する）。
  (c) 正を `.claude/skills/` へ移す（Copilotは読めるが、既存の全相互参照の書き換えと
  Antigravity非対応で利点が薄い）。

## D026: ai-manager（姉妹プロジェクト）からの知見採用

- **出典**: 同一作者の別プロジェクト ai-manager（AI秘書。Antigravityを主環境として
  同じ「正典＋薄いポインタ」構成でマルチエージェント対応済み）の PORTABILITY.md。
  設計思想が独立に一致していることを確認した上で、相互比較で見つかった差分のうち
  ハーネス側に欠けていた3点を採用した。
- **採用した項目**:
  1. **Antigravity IDEはプロジェクト内スクリプトフックを読まない**（ai-managerでの
     実機検証により判明）。機械的保護はIDEのDeny List（Settings → Permissions →
     Advanced）への手動登録で代替する。AGENTS.md・README・.agents/workflows
     アダプタ（生成文言）に反映。
  2. **`permissions.deny` の併用**: `.claude/settings.json` にツールレベルの
     ハードブロック（ハーネス設定ファイルとテンプレートへのEdit/Write禁止）を追加。
     フックと合わせて二重の機械的ガードとなり、Claude Codeが3環境で最も強い
     ガードレールを持つ。ハーネス本体の保守時は人間が一時的にdeny行を外す運用
     （CLAUDE.mdに明記）。
  3. **機能別の劣化モード明記**: READMEの対応表に「対応度の目安」を追加し、
     環境ごとに何がフルで何が劣化かを利用者が着手前に判断できるようにした。
- **逆方向の還流**: ハーネス側が優位だった「ポインタの機械生成（冪等スクリプト）+
  validatorによる乖離検出」は、ai-manager向けの改善指示書
  （D:\vscode-worspace\ai-manager-improvement-handover.md）として別途まとめた
  （ai-managerはポインタを手作業維持しており、転写忘れによるドリフトのリスクがあるため）。

## D027: アダプタ生成・整合検証ツールをリポジトリに同梱

- **決定**: これまで開発セッションの作業領域にしか存在しなかったアダプタ生成スクリプトと
  整合性バリデータを `tools/generate-adapters.py` / `tools/validate-harness.py` として
  リポジトリに同梱した。skill-authoring スキルの「ポインタ同時作成」手順も
  ツール実行を第一の方法に更新した。
- **根拠**: GAS派生ハーネス構築指示書を多プラットフォーム対応(D025)に合わせて改訂する際、
  派生側がアダプタを再生成・検証する手段を持たないことが判明した。これは自分たちが
  D021で定めた「参照される仕組みには実体を同梱するか、無いことを明記する」原則への
  違反だったため解消した。同梱版はパスをスクリプト位置からの相対に変更し、
  冪等性（再実行で差分ゼロ）を確認済み。ai-manager向け還流指示書(I-1/I-2)で
  他プロジェクトに勧めた内容を、自分自身にも適用した形。

---

# GAS特化ハーネス固有の決定（GD系列）

以下は gas-webapp-dev-harness 固有の決定。構築指示書
（gas-webapp-dev-harness-kickoff.md、2026-07-06）に基づく。

## GD01: 基線同期 — テンプレートスナップショットを a8d540e に揃えた

- **決定**: 「Use this template」で作られた初期コミットには `tools/generate-adapters.py` /
  `tools/validate-harness.py` と D027 が含まれていなかった（テンプレート化がコミット
  a8d540e より前のスナップショットだった）ため、構築の最初に本体リポジトリを
  `upstream` として fetch し、差分4ファイル（tools 2本・DECISIONS.md・
  skill-authoring/SKILL.md）を a8d540e の内容に同期した。
- **根拠**: 構築指示書が「コミット a8d540e 時点からの派生」を前提とし、アダプタ再生成・
  乖離検証をこれらのツールで行うことを必須にしているため。同期後に
  `python tools/validate-harness.py` でエラー0を確認済み。
- **捨てた選択肢**: ツール無しで手書きアダプタ運用（本体D027で否定済みの状態に戻るため不採用）。

## GD02: GAS最新情報の裏取り調査（2026-07-06 実施）

- **決定**: 構築指示書のGAS技術情報を正とせず、一次情報で以下を裏取りした。
  スキルに書いた値はすべてこの調査に基づく。
- **調査結果（調査日: 2026-07-06）**:
  - **clasp 現行版は v3.3.0（2026-03-12）**。v3系でコマンド体系が刷新され
    （`create-script` / `clone-script` / `create-version` / `list-versions` /
    `create-deployment` / `update-deployment` / `list-deployments` /
    `open-web-app` / `tail-logs` 等）、v2の `deploy -i <id>` は `update-deployment <id>` に、
    `open --web` は `open-web-app` に変わった。
    **v3はTypeScriptの自動トランスパイルを廃止**（公式README明記。バンドラ
    （Rollup/esbuild等）でビルドしてからpushする方式が公式推奨）。
    認証情報はホームディレクトリの `.clasprc.json` に保存される。
    出典: [google/clasp README・Releases](https://github.com/google/clasp)
  - **クォータ（consumer / Workspace）**: スクリプト実行 6分/回、カスタム関数 30秒/回、
    トリガー合計実行時間 90分/日 / 6時間/日、トリガー数 20/ユーザー/スクリプト、
    同時実行 30/ユーザー、UrlFetch 20,000/日 / 100,000/日、UrlFetchレスポンス 50MB/回、
    Properties 9KB/値・500KB/ストア、メール送信 100宛先/日 / 1,500宛先/日。
    出典: [Quotas for Google Services](https://developers.google.com/apps-script/guides/services/quotas)
  - **appsscript.json**: `runtimeVersion`（STABLE/V8/DEPRECATED_ES5）、`oauthScopes[]`、
    `webapp.access`（MYSELF/DOMAIN/ANYONE/ANYONE_ANONYMOUS）、
    `webapp.executeAs`（USER_ACCESSING/USER_DEPLOYING）、`urlFetchWhitelist[]` 等。
    出典: [Manifests](https://developers.google.com/apps-script/manifest)、
    [Web app manifest resource](https://developers.google.com/apps-script/manifest/web-app-api-executable)
  - **HtmlService**: サンドボックスは IFRAME のみ（NATIVE/EMULATED は廃止済みで
    `setSandboxMode()` は無効）。トップレベルナビゲーション不可（リンクは
    `target="_top"` / `"_blank"` または `<base target="_top">` が必要）。
    スクリプト・外部CSS・XHRはHTTPS必須。
    出典: [HTML Service restrictions](https://developers.google.com/apps-script/guides/html/restrictions)
  - **Webアプリ**: `doGet`/`doPost` は `HtmlOutput` か `TextOutput` を返す必要がある。
    `/dev` はheadデプロイ（編集者のみ・保存済み最新コード）、`/exec` が本番。
    **デプロイを新バージョンに更新してもデプロイID・URLは不変**（ロールバックは
    デプロイの参照バージョンを旧番号に付け替えることで行う）。
    出典: [Web Apps](https://developers.google.com/apps-script/guides/web)、
    [Deployments](https://developers.google.com/apps-script/concepts/deployments)
  - **型定義**: `@types/google-apps-script` 現行 2.0.11（2026-06-05 更新）。
    出典: [npm](https://www.npmjs.com/package/@types/google-apps-script)
- **既存GAS向けAgent Skillの確認結果**: `github/awesome-copilot`（skills/ 368件を機械列挙、
  apps-script/gas/clasp/google に一致なし）、`VoltAgent/awesome-agent-skills`
  （コード検索一致なし）、agentskills.io / skills.sh（検索で該当なし）。
  **流用できる公式/コミュニティのGAS向けSkillは確認できなかった**ため、
  stack-conventions / deploy-gas はゼロから作成した（skill-authoring の
  「流用優先」原則に従い確認した上での新規作成）。

## GD03: stack-conventions（GAS規約）を事前同梱 — 本体D021の逆適用

- **決定**: 本体では「スタック規約Skillは設計フェーズでスタック確定後に動的作成」だが、
  本ハーネスはスタックがGASに固定なので `.github/skills/stack-conventions/SKILL.md` を
  事前同梱した（V8前提、clasp v3+TSローカル開発構成、クォータ、PropertiesService/
  LockService、HtmlService/google.script.run パターン）。
- **根拠**: スタック固定の派生ハーネスでは「動的に育てる」の利点（汎用性）が不要になり、
  事前確定の利点（設計・実装フェーズの調査コストゼロ・毎回同じ品質）が上回る。
  databricks派生で実績のある方式。値はGD02の裏取り済みのもののみ記載。
- **捨てた選択肢**: 本体同様の動的作成（毎プロジェクトで同じ調査を繰り返すため不採用）。

## GD04: deploy-gas（デプロイ手順）を事前同梱 — 同じくD021の逆適用

- **決定**: `.github/skills/deploy-gas/SKILL.md` を事前同梱した。クイックリファレンス
  （clasp v3コマンド）、冪等な初期化、push→create-version→update-deployment の
  URL不変デプロイ、検証、ロールバック、人手必須境界（初回OAuth同意・スコープ変更時の
  再承認・アクセス設定変更）、GitHub Actions CI/CDの雛形を含む。
- **根拠**: GD03と同じ。デプロイ先も固定なので release フェーズの
  「Skillが無ければその場で作る」ループを省略できる。
- **捨てた選択肢**: リリースフェーズでの動的作成（不採用理由はGD03と同じ）。

## GD05: environment_template.md をGAS前提で事前記入

- **決定**: `docs/01-requirements/environment_template.md` の見出し構成は維持したまま、
  GASで確定する項目（デプロイ先=GAS、手段=clasp v3、認証=OAuth+`.clasprc.json`）を
  事前記入し、プロジェクトごとに選択が必要な項目（コンテナバインド vs スタンドアロン、
  `webapp.access` / `executeAs`、GCPプロジェクト紐付け要否）を選択式にした。
  自動化境界の既定も「clasp push/デプロイ=自動可、初回OAuth同意・スコープ再承認・
  アクセス設定変更=人手」と事前分類した。
- **根拠**: 要件定義フェーズで最も破綻しやすい environment.md を、スタック固定の
  利点を活かして「選ぶだけ」にする。ブラウザでの手動承認が必須の操作
  （OAuth同意画面）は技術的に自動化不能であることが裏取りで確認できたため既定を「人手」にした。

## GD06: テストは2層構造（ローカル純粋関数 + デプロイ先結合）を標準化

- **決定**: `test-case-design` スキルにGAS固有の節を追加。GASはローカル実行不可のため、
  (1) ロジックをGAS非依存の純粋関数に分離して Node/TS でユニットテスト、
  (2) GASサービス依存部はデプロイ先での結合テスト、の2層を標準とする。
  Webアプリは既存のPlaywright確認を `/exec` URL に対して実行し、
  ui-design-mockup（視覚デザインゲート）もそのまま必須とする。
- **根拠**: GASにローカル実行環境は存在しない（V8ランタイムはGoogle側でのみ動く）。
  ロジック分離は clasp 3 のバンドラ前提ビルド（GD02）と自然に整合する。
  なお `webapp.access` が ANYONE_ANONYMOUS 以外の場合、`/exec` はGoogleログインを
  要求するためPlaywright自動確認が困難になる。この制約と対処（テスト時の一時的な
  アクセス設定 or 手動確認への切替判断）もスキルに明記した。

## GD07: design / release エージェントのGAS向け軽微調整

- **決定**: `design.agent.md` — 技術スタック選定の質問はしない（GAS固定）。ユーザーに
  委ねるトレードオフ提示は「GAS内での選択」（コンテナバインド vs スタンドアロン、
  executeAs/access、UI構成、データ格納先）に読み替える注記を追加。stack-conventions は
  同梱済みのため「新規作成」ではなく「必要時に追記」に変更。
  `release.agent.md` — 着手時の疎通確認を「clasp認証状態の確認（`clasp list-scripts` が
  成功するか）・`.clasp.json` の scriptId 確認・`clasp list-deployments` でのデプロイ先
  URL確認」に具体化。deploy-gas 同梱済みを前提に手順を参照させる。
- **根拠**: 構築指示書 3-5。振る舞いの正は .agent.md に置く等価性ルール（D008/A-5）に
  従い、プロンプト側は変更していない。

## GD08: 既存のGAS開発テンプレートと比べた優位性（構築指示書の完了条件）

- **確認した比較対象（2026-07-06）**: iansan5653/gas-ts-template、cristobalgvera/ez-clasp、
  sqrrrl/apps-script-typescript-rollup-starter、tomoyanakano/clasp-typescript-template、
  howdy39/gas-clasp-starter 等（GitHub上の主要なGAS向けテンプレート）。
- **結論**: 既存のGASテンプレートはいずれも**ビルド/ツーリングの雛形**
  （TypeScript+lint+バンドラ+claspの初期構成）であり、要件定義→設計→実装→テスト→
  リリースのSDLC全体をオーケストレーションするものは確認できなかった。
  **該当する既存のGAS特化「開発ハーネス」は確認できなかった。**
- **本ハーネスの優位性（言語化）**:
  1. **SDLCオーケストレーション**: フェーズゲート・独立レビュー（spec-critic/reviewer）・
     視覚デザインゲート（HtmlService Webアプリと特に相性が良い）・成長ループを持つ。
     既存テンプレートは「コードを書き始める環境」までしか提供しない。
  2. **GAS焼き込みの事前確定**: environment_template / stack-conventions / deploy-gas に
     裏取り済みの現行仕様（clasp v3コマンド体系・クォータ・manifest）が焼き込まれており、
     エージェントが毎回調査する必要がない。既存テンプレートはGAS制約の知識を提供しない。
  3. **3プラットフォーム対応**: Copilot / Claude Code / Antigravity で同じ振る舞い
     （本体D025を継承）。既存テンプレートはエージェント環境非対応。
  4. **機械的ガードレール**: シークレット検知・破壊的操作の確認・ハーネス自己改変防止
     （GASでは `.clasprc.json` の漏えい防止が特に重要）。

## GD09: gas-access-control スキル — チーム限定アクセス制御の標準部品化

- **決定**: `.github/skills/gas-access-control/SKILL.md`（+ `references/access-control.js`
  参照実装）を新設し、GAS Webアプリの「特定チーム限定」を実現するアプリ層allowlist照合を
  標準パターン化した。environment_template の「Webアプリ設定」に「アクセス制御方式」
  「allowlistの管理場所」の要選択行を追加し、design エージェントの「GAS内での選択」・
  test-case-design の認可テスト観点・stack-conventions からの参照も接続した。
- **根拠**: `webapp.access` には特定ユーザー集合に限定する選択肢が無い
  （`DOMAIN` はドメイン**全体**で、ユーザーの指摘どおり広すぎる）。よってチーム限定は
  アプリ層で自作するしかないが、素朴に作ると2つの穴を高確率で踏む。いずれも
  一次情報で裏取り済み（2026-07-06）:
  1. **本人確認の信頼性**: `getActiveUser().getEmail()` は「execute as me
     （USER_DEPLOYING）のWebアプリでは空文字。ただし開発者自身または同一Workspace
     ドメインのユーザーには制限が適用されない」
     （[Session reference](https://developers.google.com/apps-script/reference/base/session)）。
     → 構成の判定表（Workspace内チーム限定 = DOMAIN+USER_DEPLOYING+allowlist、
     consumer横断 = ANYONE+USER_ACCESSING+allowlist）としてスキル化。
  2. **認可バイパス**: `google.script.run` は doGet を経由せず公開サーバ関数を直接
     呼べる。`_` 終わりの関数・ライブラリ内・非トップレベル関数は呼べない
     （[Communication guide](https://developers.google.com/apps-script/guides/html/communication)）。
     → 「全公開関数の先頭で requireAuth_() + 内部関数は `_` で非公開化」を鉄則化。
  - 「データを共有するのではなく作りを標準化する」というユーザーの方針
    （2026-07-06の対話）に基づく。ハーネスは特定アプリのコードを含まない原則だが、
    スキルの `references/` に参照実装を置くのは security-review と同様の既存作法の範囲。
- **捨てた選択肢**: (a) URLトークン（共有シークレット）方式を既定にする —
  「リンクを知っている人全員」と等価の弱い認可のため、判定表で構成変更を促す扱いに留めた。
  (b) Drive共有（シート共有）だけに依存 — USER_ACCESSING構成ではデータ層の防御として
  機能するが、利用者がアプリを迂回してシートを直接開けるため、UI限定・列秘匿の要件を
  満たせない。トレードオフとしてスキルに明記。
  (c) 判定表の無条件信頼 — 挙動はアカウント種別依存のため「初回プロジェクトの
  テストフェーズで実測確認し、異なればスキルを修正して learnings.md に記録」を
  スキル本文に組み込んだ。
