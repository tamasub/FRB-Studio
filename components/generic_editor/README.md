# Generic Editor

ViewDef対応汎用エディターの正本。FRB_Studio/components/generic_editor/ に配置する。

- editor.js: 入力コントロール生成・値収集。現段階では option_settings のDOM/APIに依存する。
- editor.css: 既存UIのスタイル。
- field_contract.mjs: ViewDefフィールド・表示条件の共通解決。Node側からも利用する。

今回の変更は配置整理のみ。独立APIやMarkdownエディターの実装は次段階。
option_settings/web/index.html と server.mjs は利用側に残す。HTTPの /editor.js, /editor.css, /field_contract.mjs は従来どおり。旧web配下の3ファイルは削除する（互換コピーは置かない）。

テスト: Studioルートから `node --test tests/option_settings/*.test.mjs`。

## 次段階の位置づけ

`../editor_contract/` の共通契約を使い、個別コンポーネントを組み合わせる側となる予定。
`../text_editor/` と `../markdown_editor/` はその最初の実装候補。
現時点では既存の内部コントロール生成・値収集を維持する。詳細は `../README.md` を参照。
