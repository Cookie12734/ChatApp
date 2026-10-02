# 指示監査と改善結果

監査日: 2026-09-09。対象: ChatAppの当日時点のmain作業ツリー、利用可能な23個のSKILL.md本文、および判断に必要な参照資料。サブエージェントは使用していません。これはその時点の判断記録です。

リモートのorigin/mainには2026-10-02確認時点でAGENTS.mdとdocs/agent-workflow.mdが既にあり、本記録の作成後により詳しい指示が追加されています。コミットではそのリモート内容を優先し、この記録を現在のAGENTS.mdや作業手順の代替として扱いません。

## 結論と前提

- 作業開始時の現在のリポジトリにはAGENTS.mdとdocs/がありませんでした。空の個人AGENTS.mdも確認しました。旧文書を削ったのではなく、実装を根拠に新規作成しました。
- 共有会話は参照できましたが、そこにある「AGENTS.md 74行」「Skill 28件」「87テスト」「lintエラー」は現在の事実として引き継いでいません。
- GPT-6 Astraの能力向上だけを理由に不要と断定できる指示はありません。モデル世代ではなく、重複、実際の仕様差、適用範囲、矛盾、副作用を根拠に整理しました。
- 安全確認、認証・権限、DBの副作用、検証の証拠は、モデルが自然に注意すると期待できても残しました。プロジェクト固有の事実はモデルの一般能力で補えません。
- 個人Skillは3本とHallmarkの関連5文書を変更しました。システムSkill・配布プラグインは変更していません。個人Skillの変更は、このリポジトリ以外での今後の利用にも適用されます。
- 旧指示の引用は監査データであり、現在の実行指示ではありません。本記録は通常作業の必読にしていません。

## 読んだ範囲

23本文、合計4,996行を対象にしました。表の行数と後述の引用行番号は**変更前**です。関連文書はHallmarkの出力契約、状態、study、audit、redesign、参照ルーティング、および検証・実行環境に必要な資料を確認しました。全Skillの補助ファイル・カタログ全件を再帰的に読んだ、という意味ではありません。

今回だけは全本文を監査対象として読みました。通常のSkill利用では、descriptionによる選択後に必要本文・参照を読む構成にします。[公式のSkill説明](https://learn.chatgpt.com/docs/build-skills)

原本パス・行数・SHA-256は監査時のローカルinventoryに記録しました（個人端末の絶対パスを含むためリポジトリには追加しません）。個人Skillの変更前テキストは次のローカル保存先に残しています。

`C:/Users/Y_Oishi/.codex/visualizations/2026/09/09/01a083b3-5799-7c63-b95f-674fa28e76c6/skill-audit/before/`

## 【残す】各Skillの判断を改善する指示

| Skill                 | 旧本文行数 | 残す理由（1行）                                                                      | 対応                     |
| --------------------- | ---------: | ------------------------------------------------------------------------------------ | ------------------------ |
| imagegen              |        315 | 生成・編集・コード資産の使い分けは、誤った成果物形式を防ぐ。                         | 本体は保持／下記提案のみ |
| openai-docs           |         38 | 公開仕様を公式資料で確認する方針は、記憶と現行仕様の混同を防ぐ。                     | 本体は保持／下記提案のみ |
| plugin-creator        |        249 | manifest検証と開発時の再導入手順は、配置しただけで有効と誤認することを防ぐ。         | 本体は保持／下記提案のみ |
| skill-creator         |        229 | 適用範囲をdescriptionへ明記し参照を分離する設計は、誤起動と読込量を減らす。          | 本体は保持／下記提案のみ |
| skill-installer       |         58 | 既存ディレクトリへの上書き中止は、個人の変更を保護する。                             | 本体は保持／下記提案のみ |
| codex-ultra-optimizer |         30 | 子の作業範囲・必要文脈・統合責任の明示は、分担時の漏れを防ぐ。                       | 個人版を修正             |
| computer-use          |         29 | 対象アプリに対応する操作手段を確認する手順は、未対応APIの推測を防ぐ。                | 本体は保持／下記提案のみ |
| deep-research         |        155 | 明示的な深掘り依頼に限定する条件は、通常調査の不必要な長期化を防ぐ。                 | 本体は保持／下記提案のみ |
| designer-skill        |         79 | 既存の製品・デザイン資料を優先する方針は、無関係な新規デザインへの逸脱を防ぐ。       | 本体は保持／下記提案のみ |
| raster-logo-svg       |         88 | 埋込SVGと真のベクター化を区別する説明は、編集可能性の誤説明を防ぐ。                  | 本体は保持／下記提案のみ |
| release               |        108 | designer-skill自身のリリースに対象を限定する手順は、別リポジトリでの誤公開を防ぐ。   | 本体は保持／下記提案のみ |
| documents             |        534 | Wordの編集可能性と描画検証は、抽出テキストだけでは見えない崩れを捉える。             | 本体は保持／下記提案のみ |
| hallmark              |        569 | 既存design.mdと部品構成の尊重は、ページごとの別物化を防ぐ。                          | 個人版を修正             |
| pdf                   |        150 | AcroFormの論理フィールドと描画を別々に確認する手順は、入力と表示双方の欠陥を捉える。 | 本体は保持／下記提案のみ |
| plugin-management     |         58 | 明示的な削除依頼を条件とする方針は、接続・アプリの誤削除を防ぐ。                     | 本体は保持／下記提案のみ |
| ponytail              |        120 | 既存機能・標準機能を再利用する判断順は、依存と保守面積を小さくする。                 | 個人版を修正             |
| presentations         |        226 | 表・グラフの編集可能性と描画検証は、見た目だけの納品を防ぐ。                         | 本体は保持／下記提案のみ |
| sites-building        |        233 | 既存Sitesプロジェクトの識別と所有する開発環境の確認は、誤った場所への実装を防ぐ。    | 本体は保持／下記提案のみ |
| sites-hosting         |         51 | 公開先と配備状態を確認する手順は、未公開を公開済みと報告することを防ぐ。             | 本体は保持／下記提案のみ |
| spreadsheets          |        445 | 数式・再計算・エラー値の検証は、表示が整っていても値が誤る問題を捉える。             | 本体は保持／下記提案のみ |
| excel-live-control    |        512 | 接続されたExcelセッションと静的ファイルの区別は、誤ったブック操作を防ぐ。            | 本体は保持／下記提案のみ |
| template-creator      |        206 | 再利用テンプレートと単発成果物を分ける条件は、不要なSkill作成を防ぐ。                | 本体は保持／下記提案のみ |
| visualize             |        514 | 表示領域・テーマ・通信制約への対応は、会話内で動かない可視化を防ぐ。                 | 本体は保持／下記提案のみ |

### リポジトリで残す・明文化した判断

| 正本・根拠                        | 指示と理由                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| design.md、実際のUI実装           | 縦型サーバーレールとnative sansを維持する。古いデザイン案やSkillの好みで製品構造を変えないため。 |
| package.json、Playwright、E2E実装 | 起動とテストのDB副作用を明記する。単なる確認コマンドに見える操作で実データを変更しないため。     |
| API・SSE・各featureのserver処理   | 認証に加え所有・参加・ブロック関係の権限を確認する。チャット固有の漏えい条件を見落とさないため。 |
| .gitignore、環境設定              | env派生ファイルがすべて除外されるわけではないと明記する。コメントだけを信用しないため。          |
| 現在の実行結果                    | 完了条件を文書・コード・結合動作に分ける。必要な検証を維持しつつ文書監査でDBを触らないため。     |

## 【捨てる】個人Skillで削除・置換した指示

引用は原文そのまま、長い行は該当部分のみを抜粋しています。場所は各Skillの旧SKILL.mdの1始まり行番号です。

| 旧箇所                   | 原文引用                                                                                                                                                                                                                                                                                                                                                                                                                               | 理由・対応                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ponytail:28              | ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if                                                                                                                                                                                                                                                                                                                                                                 | 全応答への継続適用は、その都度のSkill選択と衝突。削除。                            |
| ponytail:41              | 6. **Can it be one line?** One line.                                                                                                                                                                                                                                                                                                                                                                                                   | 短さは理解しやすさの代理にならない。最小で保守可能な変更へ置換。                   |
| ponytail:62              | - Complex request? Ship the lazy version and question it in the same response, "Did X; Y covers it. Need full X? Say so." Never stall on an answer you can default.                                                                                                                                                                                                                                                                    | 依頼を一部省略してから確認するため、要求完遂と衝突。削除。                         |
| codex-ultra-optimizer:13 | 2. If the user explicitly says `normal`, `通常`, `普段通り`, or asks for lightweight Sol, use `gpt-5.6-sol` with `low` reasoning effort.                                                                                                                                                                                                                                                                                               | 「通常」だけでAstraからSolへ切り替える根拠がない。明示的な子モデル指定以外は継承。 |
| codex-ultra-optimizer:26 | - Because model overrides cannot use a full-history fork, choose the smallest positive `fork_turns` value that still preserves required conversation context. If no bounded turn count is safe, use `none` and provide a self-contained task message with all required context.                                                                                                                                                        | 現在のspawn仕様はこの引数を持たない。実際のschema参照へ置換。今回はspawn未実行。   |
| hallmark:239             | There is no "the brief looks complete" exception. There is no "the user already named all three" exception. There is no length threshold below which asking is skipped. A long, detailed brief gets the same three-question prompt as a five-word one — the user can wave you through with _"go ahead"_ in two seconds. **Default is to ask. The cost of asking is one extra message; the cost of guessing wrong is a whole rebuild.** | 既に与えられた条件を再質問するだけの往復を生む。未解決の重要事項だけ質問。         |
| hallmark:90              | Every interactive component MUST ship code for **all 8 states**: default · hover · `:focus-visible` · `:active` · disabled · loading · error · success.                                                                                                                                                                                                                                                                                | 状態のない部品にも架空の機能を追加させる。実在する状態だけ対象。                   |
| hallmark:57              | Stamp the six scores at the top of the artifact (`/* Hallmark · pre-emit critique: P5 H4 E5 S4 R5 V5 */`).                                                                                                                                                                                                                                                                                                                             | 自己採点は品質の証拠ではなく、成果物へ不要な記号を残す。削除。                     |
| hallmark:475             | **Always emit `tokens.css`.**                                                                                                                                                                                                                                                                                                                                                                                                          | 既存のtoken正本と重複する。必要な場合に限定。                                      |
| hallmark:476             | append all four export formats — `tokens.css`, Tailwind v4 `@theme`, DTCG `tokens.json`, shadcn/ui CSS variables — into `design.md`'s `## Exports` section.                                                                                                                                                                                                                                                                            | 利用者のない複製を毎回作る。要求された出力形式だけに限定。                         |

単なる「丁寧に考えろ」「毎回品質を自己採点しろ」といった儀式的な重複は減らしました。一方、要求の省略禁止や正本の優先は、他のSkillと実際に衝突していたため短く明記しています。「自然にやるはず」だけで保護策を消す方針にはしていません。

## 【書き換える】個人Skillとリポジトリ

| 旧箇所・記述                                                        | 問題                                                                       | 書き換え案／反映内容                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Hallmark:164 “Read it first; it overrides everything else.”         | design.mdがユーザーの最新依頼や上位指示まで上書きするように読める。        | 環境・ユーザーの範囲内で、既存design.mdを見た目の既定値より優先する。                              |
| Hallmark:188–190 “re-use”＋package/tailwindのmtime                  | design.md、font、CSS変更を見逃す。                                         | キャッシュの根拠ファイルを確認し、設計・token・CSS・font・設定の変更で無効化する。                 |
| Hallmark:285 “at least one”、293 “if two of three match … redirect” | 1軸でよいのか2軸必要なのか不一致。                                         | 新規の別案に限り、意味のある差を必要に応じて作る。同一製品には強制しない。                         |
| Hallmark:392、418、441、483                                         | 実装前previewに、実装後だけ許される検査結果を要求する循環。                | 実装前は方針、実装後は実際の検証結果を報告する。                                                   |
| Hallmark:474 “append-only”                                          | import保護の意図は正しいが、CSS重複を増やす。                              | framework importと無関係な規則を保ち、対象規則を直接編集する。                                     |
| Hallmark:528 “Pick the closest matching theme from the catalog.”    | studyしたデザインをカタログへ寄せ直す。                                    | 明示された参照の観察結果を優先し、カタログは任意の補助とする。                                     |
| Ponytail:110–111 “No frameworks, no … fixtures”                     | 既存テスト基盤にも適用され、プロジェクトの検証を弱める。                   | 既存suiteとfixtureを再利用し、新しい検証基盤を無用に作らない。                                     |
| Optimizer:14 Sol ultra→Luna high                                    | Skill適用だけでモデル選択まで承認されたか不明。                            | 明示されたrouting policyのときのみ適用。それ以外は現在のモデル・推論設定を継承する。               |
| Hallmark関連文書                                                    | 本文を短くしても、参照側が確認待ち・8状態・自己採点・exportsを再強制する。 | contract、states、study、audit、redesignも同じ境界へ更新し、本文がworkflowを決めることを明記する。 |
| design.md “Visible result means silent success”                     | 支援技術向け通知まで消す解釈が可能。                                       | 視覚的に重複するtoastを省略し、必要なaccessible feedbackは残す。                                   |
| .hallmark/preflight.jsonの旧font                                    | 実装・design.mdはnative sansだがキャッシュは旧serif。                      | 現在のfontと参照元に更新。tokens.cssの未使用display tokenは既存コードとして今回変更しない。        |
| AGENTS.md／docsが不存在                                             | 履歴だけを根拠に存在しない運用規則を復元できない。                         | 実装から索引・検証手順・判断記録を新規作成。READMEから誘導する。                                   |

新規AGENTS.mdには同じ詳細を重ねず、判断に必要な入口と安全境界を置きました。公式の探索順序も参考に、空のグローバルAGENTS.mdへ規則を移して全プロジェクトへ広げることはしていません。[公式AGENTS.mdガイド](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

## 配布・システムSkillの変更案（未反映）

ここはユーザー指定に従い提案のみです。パスはinventoryの同名Skillを参照してください。

| 分類・箇所                            | 原文引用／対象                                                                                                                                              | 理由と提案                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 書換 openai-docs:12                   | “Complete this source order before reading a reference, inspecting local or repository files”                                                               | 現在のローカル構成調査にまでweb先行を強制し、環境のlocal-first方針と衝突。公開仕様は公式確認、ローカル状態は現物から確認へ分岐する。                         |
| 書換 imagegen:79                      | “Do not promise arbitrary filesystem-path editing through the built-in tool.”                                                                               | 任意パスの保証禁止自体は妥当だが、現行ツールはreferenced_image_pathsを持つ。閲覧済みのローカル画像をschemaに従って渡せる場合と、再添付が必要な場合を分ける。 |
| 捨／置換 documents:61                 | `google-drive@openai-curated`                                                                                                                               | このセッションの推奨一覧は`google-drive@openai-curated-remote`。名前を固定せず、実際の一覧・利用可能な導入ツール・承認条件を照合する。                       |
| 捨 presentations:109                  | “Em dashes are always slop.”                                                                                                                                | 記号だけで文章品質を決められない。「必要な意味・読みやすさがなければ省く」へ置換。                                                                           |
| 捨 presentations:127                  | “Passive voice is always slop.”                                                                                                                             | 行為者不明など受動態が適切な文まで意味を変える。「責任主体を示せる場合は能動態を優先」へ置換。                                                               |
| 捨／置換 plugin-management:32,37,52   | `search_plugins`、`suggest_plugins`、`uninstall_app`                                                                                                        | 現在の提供ツール名と不一致。利用可能なツールを探索し、request_plugin_installの明示依頼等の条件、uninstall_pluginの契約を守る。存在しないAPIを呼ばない。      |
| 書換 designer-skill:18–19,30–32       | “commit_design_direction”が“Project context”より先                                                                                                          | 正本を読む前の方針確定は手戻りを生む。preflight→製品資料→方針確定→実装→検証へ並べる。                                                                        |
| 捨／限定 designer-skill:32            | “anti-references beat one-off prompts.”                                                                                                                     | 現在の明示依頼まで過去の好みが上書きする。「変更されていない制約を優先。不一致は意図を照合」へ。                                                             |
| 書換 raster-logo-svg:24,27            | “run the script from repo root or skill directory”／`python3 skills/raster-logo-svg/scripts/embed-logo.py`                                                  | その相対パスは両方のcwdで成立しない。Skill絶対パスと対象ファイル絶対パスを渡す。実在するPythonを使う。                                                       |
| 書換 computer-use:本文                | インストール済みAPIへの案内                                                                                                                                 | 現在の操作手段ごとの入口・対応OSを確認する分岐を明記。あるブラウザAPIでnative未対応だから別APIも未対応とは推論しない。                                       |
| 書換 sites-building:102,222           | “Use asset-only subagents”／“Perform no screenshots, DOM inspection, clicking, resizing, or visual QA unless the user explicitly requests browser testing.” | サブエージェント禁止や他Skillの必須UI検証と組み合わさる。分担はユーザーの許可範囲、QAは適用される上位要件に従い、実行しなかった検証を明示する。              |
| 書換 spreadsheets／excel-live-control | 数式・分析・表示の大部分が重複                                                                                                                              | 共通基準を同梱参照にまとめ、静的ファイル／接続中Excelの操作契約だけを本文に残す。配布単位が別なら各パッケージへ必要参照を同梱する。                          |
| 捨／限定 visualize:22–23              | “Work silently unless blocked or the user explicitly asks for progress. Never … send commentary or progress updates”                                        | この環境の進捗報告ルールと衝突。不要な実況は省くが、上位の報告要件には従う。                                                                                 |
| 疑問 plugin-creator:195               | “Omit unsupported plugin manifest fields that validation rejects, including `hooks`.”                                                                       | hookディレクトリとmanifest fieldは別物。対象runtime/schemaの仕様を確認して説明すべきで、一律に旧仕様とは断定しない。                                         |
| 疑問 skill-installer:30               | “it will be available on their next turn.”                                                                                                                  | 自動検出の時期は環境依存。導入後にavailabilityを確認し、未検出なら再読込を案内する。今回はインストール未実施なので断定不可。                                 |

PDF・deep-research・skill-creator・template-creator・release・sites-hostingについては、今回の証拠から直ちに削除すべきモデル矯正指示は特定しませんでした。実行対象外の制作・公開workflowを監査のために起動することもしていません。

## 【疑問】意味を判断しかねた記述と今回の扱い

1. **Hallmark:285/291/293**: 1軸でよい規則に対し、1軸だけ違う例を許可・拒否しており一意に決められませんでした。今回の改善では強制回転そのものを外し、必要な比較に限定しました。
2. **Hallmark:392/418/441/483**: 実装後検査を実装前に要求する時間順序を満たせません。方針と完了証拠を分離しました。
3. **Optimizer:13**: 「通常」が現在モデルの通常設定かSol lowへの切替か不明でした。現在モデル維持を既定にしました。
4. **designer-skill:32**: one-off promptが「気軽な希望」か「現在の明示的変更依頼」か不明でした。後者まで上書きしない提案にしました。
5. **plugin-creator:195**: hooksのmanifest対応可否は対象schema確認なしでは確定できません。配布元への確認事項として保留しました。
6. **旧ログと現行設計**: .hallmark/log.jsonには別時点のナビゲーション案があり、並び順も時系列とは限りません。履歴を削除せず、design.mdと現在の実装を優先しました。

今回の反映範囲についてユーザー判断が必要な未解決事項はありません。上記の配布元仕様の疑問は勝手に変更せず、提案に留めています。

## 実際にブロックされた／判断に迷った正確な箇所

- **ユーザー依頼（ファイル行番号なし）**: 「変更はまだ行わないでください」と「この指示で分析した結果を実行してください。」が両立しませんでした。確認への回答「監査後、リポジトリと個人Skillを改善。配布プラグイン内のSkillは変更案を提示」で解決しました。
- **AGENTS.md／docs不存在（行なし）**: 旧文書そのものを現在のファイルとして引用できませんでした。実在確認後、新規作成と明記しました。過去の行を捏造していません。
- **Hallmark旧SKILL.md:392、441、483**: 原文の“strictly Step 7, after Build.”と“Run the slop test BEFORE writing this row”が、418行の“Before emitting any code”と衝突して判断に迷いました。監査中に検出した論理矛盾であり、今回UI実装を実際に停止したという意味ではありません。
- **Optimizer旧SKILL.md:26**: 原文の“choose the smallest positive `fork_turns` value”に対応する引数が現在のspawn schemaにありません。今回は分担禁止なので呼出エラーを再現せず、静的な不一致として報告します。
- **Skill検証スクリプト:10**: `import yaml`で`ModuleNotFoundError: No module named 'yaml'`となり、付属quick_validate.pyを実行できませんでした。依存追加はせず、既存js-yamlによる同等項目の静的検証で補いました。付属スクリプト成功とは扱いません。
- **個人Skillの書込権限**: workspace外のため権限昇格を使いました。対象8ファイルを固定し、原本との一致を確認してapply_patchで反映できました。権限変更や広域設定の変更は行っていません。

## AGENTS.mdを100行程度の索引にする構成

今回実装したAGENTS.mdは整形後も91行です。詳細の複製ではなく以下の構成です。

1. このプロジェクトは何か。
2. 最初に読むもの：作業種別→正本のリンク表。
3. 必ず守ること：既存設計、権限・秘密、DB・外部副作用、検証入口。
4. 完了の定義：監査／文書／コード／結合動作ごとの確認。
5. 判断に迷ったとき：重要な不明点、モデル維持、分担の条件。
6. 指示の優先順位：環境・現在依頼・局所規則・Skill・現行設計の関係。

コマンド詳細はdevelopment.md、再利用する判断理由はdecisions.md、旧指示の全文脈はこの監査記録へ分離しています。

## 検証結果と残る制約

- 単体テスト: 30ファイル、81件成功。
- 型チェック: `tsc --noEmit --incremental false`成功。
- lint: ESLintをsrc/e2eに対して実行し成功。共有履歴のlintエラーは現在再現していません。
- Skill: 変更前保存、変更競合チェック、反映内容一致を確認。付属Python検証は前述の依存不足。
- 文書のリンク・書式、個人SkillのYAML・参照を確認しました。個人版以外の20本文は変更前SHA-256と一致しています。
- 個人Skill本文はHallmark 569→156行、Ponytail 120→67行、Optimizer 30→34行です。適用条件を明確化するため、短縮より正確さを優先した箇所もあります。
- 静的なケース照合では、文書監査がUI制作を起動しない、小さな部品変更が8状態を強制しない、既存ブランドを回転しない、分担禁止を守る、「通常」でAstraから切り替えないことを確認しました。実際のモデル応答による回帰試験ではありません。
- ビルド、新規依存インストール、E2E、DB migration、外部送信、デプロイは実行していません。
- アプリコード、package.json、lockfile、DB起動スクリプトは変更していません。
- テストDBの自動隔離、暗黙migrationの分離、env除外拡充、CI・バージョン固定は別作業です。今回の文書整備だけでそれらが解決したとは扱いません。
- 実運用での全Skill再発火やAstraとの比較実験は未実施です。読込本文の短縮は測れますが、実際の利用量削減率や品質向上率は未測定です。
