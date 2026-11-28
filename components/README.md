# FRB 共通編集コンポーネント

状態: 階層整備（実装・共通契約の確定は次段階）

## 配置

```text
components/
├── editor_contract/   共通インターフェース・Registry/Factory・共通契約テスト（予定）
├── generic_editor/    ViewDef対応の汎用エディター（既存実装）
├── text_editor/       単一行テキスト編集（予定）
└── markdown_editor/   複数行テキストの標準編集（予定）
```

将来、必要に応じて number_editor / date_editor / select_editor / grid_editor 等を同階層へ追加する。
空の実装ファイルや未使用のコンポーネントは先に作らない。

## 目的・判断軸

協働における言語化コストの最小化。既存動作とデータの保全を優先する。

- コンポーネントはいくつ増えてもいい。呼び出し方は一つ。
- 新しいコンポーネントが増えても Generic Editor の基本ロジックは変更しない。
- 複数行テキストボックスの標準実装は Markdown Editor とする。正本は文字列。
- 個別コンポーネントは他コンポーネント、呼出元、永続化に依存しない構造を目指す。
- 固有責務はコンポーネント単位で詳細に検証し、共通契約は全実装へ適用する。
- 接続は結合固有の責務を中心に代表パターンを検証する。
- 将来、既存 ViewDef・FieldDef・Validation Type の資産を利用する。コンポーネント識別キーの所在・入力制約の受渡し・検証バリエーションの詳細は未確定。

## 実装順（案）

共通契約 → Text Editor と Markdown Editor の最小実装 → Generic Editor 接続 → 追加コンポーネントによる拡張性の検証 → 編集体験・FieldDef連携の充実。

Registry への登録は許容するが、追加前後で Generic Editor 本体および既存共通契約テストに変更がないことを期待値とする。

今回、README以外の実行ファイルや既存の定義・保存処理は変更しない。既存 option_settings の HTTP 経路、起動方法および配布経路を維持する。
