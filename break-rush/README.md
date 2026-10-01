# BREAK RUSH (Phase 5)

TypeScript + Phaser 3 + Vite の2Dハイスピードアクション。現在は **Phase 5（リプレイ性）** まで実装。

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
  - 「BREAK CHANCE!」: GRUNT 大量出現ウェーブ
  - SE: WebAudio合成（音声ファイル不要）。最初のキー入力/クリックで AudioContext を開放
- **Phase 4**: ステージ進行 `WAVE 1-3 → 強化選択 → WAVE → BREAK CHANCE(大量) → ボス IRON BEAST → リザルト → 次ステージ`
  - 強化: ステージ途中で3択（POWER / SPEED / BREAKER / COMBO / RUSH / CRITICAL）。選ぶと HP+30。数値は重複して積み上がる
  - ボス IRON BEAST: 突進・地面叩き(範囲)・ミサイルを予兆(赤点滅/`!`/危険円)付きで使い分ける。ヒットで怯まず、ブレイクで初めて止まる。HP50%以下で激化(攻撃加速+雑魚追加)
  - スコア(コンボ倍率あり)・ランク(S〜D: スコア/最大コンボ/被ダメ/時間)・リザルト画面
  - 次ステージは敵数+25%、ボスHP+50%。強化は引き継ぎ
  - 開発用ショートカット: URL に `?start=upgrade` / `?start=boss` / `?start=result`（何か指定するとタイトルを飛ばす）
- **Phase 5**:
  - タイトル画面で難易度選択（NORMAL / HARD / RUSH）。HARD=敵の攻撃+50%・HP/数増・スコア×1.5、RUSH=敵数2倍で弱いがコンボ猶予-0.5秒・スコア×1.25
  - ランダム強化: 3択は前回の提示と被らないよう抽選。**シナジー**（BLITZ RUSHER = RUSH+CRITICAL+SPEED、BREAK MASTER = BREAKER+POWER+COMBO、JUGGERNAUT = ARMOR+VAMPIRE+POWER）が完成する選択肢には ★ が付く
  - ステージ分岐: リザルトで次の道を選択。SWARM ROAD（敵+40%・スコア×1.3）/ FORTRESS ROAD（敵-20%・強化+1回・ボスHP+30%）
  - ハイスコア: 難易度別ベスト、最大コンボ、クリアステージ、設定(サウンド)を localStorage に保存。リザルト/ゲームオーバーで `BEST ... (あと N)` / `NEW RECORD!` を表示
  - アンロック: HARD(ステージ1クリア) / RUSH(ステージ2クリア) / VAMPIRE強化(30コンボ) / ARMOR強化(1ランで20,000点)
  - `M` でサウンドON/OFF（設定は保存）
  - 保存データのリセット: ブラウザの DevTools で `localStorage.removeItem('break-rush-save-v1')`

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
