# BREAK RUSH

爽快・横スクロール・アクションローグライクRPG。TypeScript + Phaser 3 + Vite。

右へ走り抜け、群れを斬り、戦利品を浴び、レベルを上げ、レリックで尖ったビルドを組み、3つのゾーンのボスを倒す。死んでも **シャード** が残り、次のランが強くなる。

## 起動方法

```bash
cd break-rush
npm install
npm run dev           # http://localhost:5173
npm run build         # 型チェック + dist/（itch.io 用）
npm run build:local   # dist-local/index.html 単一HTML（ダブルクリックで起動）
npm test              # Vitest
```

## 操作

| 操作 | キー |
| --- | --- |
| 移動 | A / D または ← / → |
| ジャンプ | Space |
| 攻撃（3連コンボ） | J |
| スキル **RUSH SLASH**（無敵の突進斬り） | L |
| 必殺技 **OVER BREAK**（ゲージ満タンで画面全体） | I |
| 回避 / RUSH（敵撃破直後） | Shift |
| 調べる（宝箱・焚き火・商人） | E / ↑ |
| サウンド ON/OFF | M |

## 遊びの流れ

1. **部屋を右へ走り抜ける**。道中の雑魚の群れや木箱を斬りながら進み、要所で画面ロックの戦闘（敵が左右から押し寄せる）。全滅させると `GO ▶`。出口の門へ。
2. **戦利品**: 敵を倒すとコイン・経験値・回復がはじけ飛び、自動で吸い込まれる（連続で拾うほど音程が上がる）。部屋クリア時は残りを全部吸い寄せる。
3. **レベルアップ**: 3択の強化（攻撃/速度/ブレイク/コンボ/RUSH/クリティカル/HP/磁石/金運/経験値…）。組み合わせで **シナジー** が発動（★表示）。
4. **レリック**（エリート/ボス/宝箱/商人）: 敵が爆発する・クリティカルで雷・回避で衝撃波・被弾で反撃・不死鳥…と遊びが変わる。
5. **道を選ぶ**: 部屋クリア後に次の部屋を選択 ── 通常戦闘 / エリート / 宝箱 / 焚き火 / 商人。ボス前は必ず焚き火の選択肢あり。
6. **3ゾーン × 5部屋**（最後はボス IRON BEAST → MK-II → OMEGA）。
7. **永続強化**: 死んでも勝ってもシャードが貯まる。タイトルで `U` → HP・攻撃・金・経験値・必殺技の初期ゲージ・初期レリックを恒久強化。

## 戦闘

- 敵は **予兆（赤く点滅・のけぞり・`!`・警告音）→ 攻撃 → 隙**。予兆中に先に殴ればキャンセルできる。同時に攻撃するのは最大3体。
- **GRUNT**（基本）/ **RUSHER**（赤い進路のあと突進。回避で抜ける）/ **GUARD**（正面からの弱攻撃は盾で防ぐ。3段目・カウンター・RUSH・スキル・背後は有効）/ **エリート**（巨大化・高報酬）。
- コンボ、ブレイク（ゲージを削ると無防備＋ダメージ2倍）、ヒットストップ、カウンター、RUSH（撃破直後の高速追撃）、3体以上の同時撃破でスローモーション。
- 難易度 NORMAL / HARD / RUSH（タイトルで選択。HARD=ステージクリアで解放、RUSH=ゾーン2のボスで解放）。

## 配布

- **itch.io**: `npm run build` → `dist/` の中身を ZIP のルートに `index.html` が来るように固めてアップロード（HTML5）。
- **単一HTML**: `npm run build:local` → `dist-local/index.html`（約1.6MB、上限20MB）。`file://` で動作（localStorage・WebAudio 含む）。
- 画像・音声ファイルは不使用（図形はCanvas生成、SEはWebAudio合成）。外部通信なし。
- セーブ（ベストスコア・シャード・永続強化・アンロック・設定）は localStorage。消すには DevTools で `localStorage.removeItem('break-rush-save-v1')`。

## 開発用

- URL に `?debug` で `window.__game`（自動テスト用）。
- `?start=combat|elite|treasure|rest|shop|boss` でその部屋から開始。`&zone=2` `&gold=500` `&level=8` で状態を指定。

## 構成

- `src/combat/` 純粋な戦闘ロジック（ダメージ・コンボ・ブレイク・敵の攻撃サイクル・攻撃枠・ガード判定…）
- `src/systems/` 純粋なRPG/ローグライクロジック（レベル、ドロップ、部屋生成、ラン進行、レリック、スキル、永続強化、セーブ、アンロック）と、戦利品/小道具/スポーナー
- `src/enemies/` 敵（`MeleeEnemy` 基底 + Grunt/Rusher/GuardEnemy、ボス IronBeast）
- `src/scenes/` Boot / Title / Meta(永続強化) / Game(部屋) / Choice(カード選択) / RunEnd
- `tests/` Vitest
