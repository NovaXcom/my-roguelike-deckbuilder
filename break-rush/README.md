# BREAK RUSH (Phase 3)

TypeScript + Phaser 3 + Vite の2Dハイスピードアクション。現在は **Phase 3（気持ちよさ）** まで実装。

## 起動方法

```bash
cd break-rush
npm install
npm run dev      # http://localhost:5173
npm run build    # 型チェック + dist/ へビルド
npm test         # Vitest（戦闘ロジックの単体テスト）
```

## 操作

| 操作 | キー |
| --- | --- |
| 移動 | A / D または ← / → |
| ジャンプ | Space |
| 通常攻撃（3連コンボ） | J |
| 回避 / RUSH | Shift |
| リスタート（ゲームオーバー時） | R |

## 実装済み

- **Phase 1**: 移動・ジャンプ・攻撃、GRUNT、HP、撃破エフェクト
- **コンボ**: J 3連（3段目は重い締め）。ヒット数表示とタイマー（2.5秒）、コンボ数でダメージ最大+50%
- **ブレイク**: 敵のブレイクゲージ(黄)を削り切ると BREAK!!（2.5秒無防備、被ダメージ2倍）
- **ヒットストップ / ノックバック / 画面揺れ / ダメージ数字**
- **回避**: Shift で短時間無敵ダッシュ。直後(0.45秒以内)に J でカウンター（ダメージ2倍）
- **RUSH**: 敵を倒すと近くの敵に `>>> RUSH` が出る。1.5秒以内に Shift で高速移動し自動追撃
- **Phase 3**:
  - パーティクル（加算合成の火花）、衝撃波リング、斬撃ライン、残像、ズームパンチ
  - コンボ10/25/50/100でバナー+SE+画面揺れ。25以降はカウンターが震える
  - 3/6/10体以上を1秒以内に倒す「N KILLS!」でスローモーション・フラッシュ・金色パーティクル
  - 約12秒後・以後22秒ごとに「BREAK CHANCE!」: GRUNT 12体が一斉出現
  - SE: WebAudio合成（音声ファイル不要）。最初のキー入力/クリックで AudioContext を開放

## 構成

- `src/combat/` 純粋な戦闘ロジック（ダメージ・コンボ・ブレイク・ヒットストップ・RUSH）
- `tests/` 上記ロジックの Vitest テスト
- `src/player/` プレイヤーと攻撃状態
- `src/enemies/` `Enemy` 基底クラス + `Grunt`
- `src/systems/` 敵スポーナー（後でウェーブ管理に置換）
- `src/effects/` ダメージ数字・パーティクル・リング等
- `src/audio/` WebAudio 合成SE
- `src/ui/` HUD
- `src/scenes/` Boot（仮テクスチャ生成）/ Game
