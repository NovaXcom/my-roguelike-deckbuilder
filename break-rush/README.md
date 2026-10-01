# BREAK RUSH (Phase 1)

TypeScript + Phaser 3 + Vite の2Dハイスピードアクション。現在は **Phase 1（最小プロトタイプ）** のみ実装。

## 起動方法

```bash
cd break-rush
npm install
npm run dev      # http://localhost:5173
npm run build    # 型チェック + dist/ へビルド
```

## 操作

| 操作 | キー |
| --- | --- |
| 移動 | A / D または ← / → |
| ジャンプ | Space |
| 通常攻撃 | J |
| リスタート（ゲームオーバー時） | R |

## Phase 1 の内容

プレイヤー(HP100)の移動・ジャンプ・攻撃、プレイヤーへ近づくGRUNT 1種、被弾/ダメージ数字/撃破エフェクト、HP表示。

## 構成

- `src/combat/` 純粋な戦闘ロジック（矩形判定・ダメージ）
- `src/player/` プレイヤーと攻撃状態
- `src/enemies/` `Enemy` 基底クラス + `Grunt`
- `src/systems/` 敵スポーナー（後でウェーブ管理に置換）
- `src/effects/` ダメージ数字・パーティクル
- `src/ui/` HUD
- `src/scenes/` Boot（仮テクスチャ生成）/ Game
