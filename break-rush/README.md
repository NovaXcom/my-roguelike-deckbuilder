# BREAK RUSH 3D

3D・ハクスラ・サバイバー系アクション。TypeScript + Three.js + Vite。素材ファイルなし（全部コードで生成）、サーバー不要。

> 2D 横スクロール版（Phaser）は履歴に残っています: `git show a4dbcfc`

## 遊び方

攻撃は **全自動**。動いて、群れを呼び込んで、一網打尽にするゲームです。

| 操作 | キー / タッチ |
| --- | --- |
| 移動 | WASD / 矢印キー / 画面左をドラッグ |
| ダッシュ（無敵あり） | Space / Shift / DASH ボタン |
| **必殺技 OVER BREAK**（画面全消し） | Q / R / E / F / ULT ボタン |
| ポーズ | Esc / P |

1. 敵を倒すと **宝石(XP)・コイン・回復** が飛び出して吸い込まれる。
2. レベルアップのたびに **3択のカード**（レア度: COMMON / RARE / EPIC / LEGENDARY — 高いほど一気に強くなる）。リロール2回。
3. 武器5種（斬撃波・回転刃・雷・ホーミングミサイル・地震リング）+ 能力10種。最大5武器まで。
4. **エリート**（金色）を倒すと宝箱 → 全部もらえる。**ボス**が2分ごと（最終ボスは8:00）。
5. **連続キル**で `NICE!` → `GREAT!` … `LEGENDARY!!!!!` とボーナス。
6. 周期的に **HORDE**（敵が全周から迫る）。そこで必殺技。
7. 倒れても **コイン** が貯まり、タイトルの UPGRADES で永続強化、ヒーロー解放（BLAZE / SPARKY / TANK-O）。
8. 難易度 EASY / NORMAL / HARD（最初の3分かけて効いてくるので、序盤は常に無双できる）。

## 起動

```bash
cd break-rush
npm install
npm run dev           # http://localhost:5173
npm run build         # 型チェック + dist/（itch.io 用）
npm run build:local   # dist-local/index.html 単一HTML（ダブルクリックで起動）
npm test              # Vitest
```

- **itch.io**: `dist/` の中身を ZIP のルートに `index.html` が来るように固めてアップロード（HTML5）。
- **単一HTML**: `dist-local/index.html`（約650KB、上限20MB）。`file://` で動作（保存・音声・タッチ含む）。
- 重い端末では自動で「軽量モード」に切り替わります（タイトルの FX: LOW でも手動切替可）。
- セーブは localStorage。消すには DevTools で `localStorage.removeItem('break-rush-3d-save-v1')`。

## 構成

- `src/logic/` ルールだけの純粋ロジック（Three.js 非依存・テスト対象）: 空間ハッシュ、出現制御 Director、武器とカードの抽選、レベル曲線、連続キル、必殺ゲージ、永続強化、難易度、セーブ
- `src/game/` 描画と操作: Game（ループと結線）、World、Player、Enemies（インスタンス描画）、Pickups、Weapons、Boss、Fx、Hud(DOM)、Input
- `src/audio/` WebAudio 合成のSE
- `tests/` Vitest

## 開発用

- `?debug` で `window.__g`（自動テスト用）。`&speed=4` でシミュレーション加速、`&hifx` で自動軽量化を無効化、`&lowfx` で軽量モード。
