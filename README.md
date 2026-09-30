# オリジナル・パーティローグRPG

Phaser 3 + TypeScript + Vite + Vitest 製。設計は `GAME_DESIGN.md` / `ART_DIRECTION.md` を参照。

| コマンド | 内容 |
| --- | --- |
| `npm install` | 依存インストール |
| `npm run dev` | 開発サーバー (http://localhost:5173) |
| `npm test` | Vitest 単体テスト (`tests/`) |
| `npm run build` | 通常ビルド → `dist/` (itch.io 用) |
| `npm run build:local` | 単一HTMLビルド → `dist-local/index.html` (ダブルクリックで起動可) |

## 構成
- `src/core/` — UI非依存の戦闘ロジック（スキル/クールダウン、ダメージ計算、ブレイク＆チェイン、ヘイト）。テスト対象。
  - `data.ts`: スキル・パーティ・敵の定義 / `battle.ts`: 状態遷移
- `src/scenes/` — Title / Party(編成確認) / Battle
- `src/ui/art.ts` — Canvas描画のキャラ・アイコン（画像アセット不要）
- `src/audio.ts` — WebAudio 合成の SE とドローンBGM（最初のクリックで開放）

## 戦闘ルール
- 前衛ナイト＋後衛エレメンタリストが毎ターン1回ずつスキルを使用（順序は自由）。強スキルは使用後CD（クールダウン）あり。
- 敵の「シールドゲージ」を削り切る → **ブレイク**（敵は次の行動を失い、シールド全回復）。
- ブレイク中に**魔法**を当てる → **チェイン**（ダメージ×2 + カットイン）。弱点属性は×1.5、耐性は×0.5。
- シールドが残っている間、敵へのHPダメージは×0.75。
- 敵のインテントに標的が表示される。後衛狙いは、ナイトの「挑発の構え」で前衛に逸らせる。

操作: スキルをクリック（ホバーで予測ダメージと矢印）/ 全員行動で自動ターン終了 / `Space` で手動終了 / `M` ミュート
