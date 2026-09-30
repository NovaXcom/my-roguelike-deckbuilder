# カード＆スキル・ローグRPG

Phaser 3 + TypeScript + Vite + Vitest 製のデッキ構築ローグライク。設計は `GAME_DESIGN.md` / `ART_DIRECTION.md` を参照。

| コマンド | 内容 |
| --- | --- |
| `npm install` | 依存インストール |
| `npm run dev` | 開発サーバー (http://localhost:5173) |
| `npm test` | Vitest 単体テスト (`tests/`) |
| `npm run build` | 通常ビルド → `dist/` (itch.io 用) |
| `npm run build:local` | 単一HTMLビルド → `dist-local/index.html` (ダブルクリックで起動可) |

## 構成
- `src/core/` — UI非依存のゲームロジック（山札/手札/捨て札、エナジー、ダメージ/ブロック、ターン進行）。テスト対象。
- `src/scenes/` — Phaser シーン (Title / CharacterSelect / Battle)
- `src/ui/` — Canvas(Graphics)描画のカード・アート（画像アセット不要）
- `src/audio.ts` — WebAudio 合成の SE とドローンBGM（最初のクリックで開放）

## 操作 (戦闘)
- カードにホバーで拡大 / ドラッグで使用（攻撃は敵にドロップ、スキルは上部へドロップ）
- `ターン終了` ボタンまたは `E` キー、`M` でミュート切替
