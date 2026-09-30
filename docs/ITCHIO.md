# itch.io への投稿手順

## 1. ZIPを作る
```bash
npm install
npm run package:itch      # tests不要のビルド + release/ にZIPを出力
npm run verify:itch       # 任意: itch.io相当の配信形態(サブパス+別オリジンiframe)で動作検証（要Playwright）
```
出力（`release/`）:

| ファイル | 用途 |
| --- | --- |
| `party-roguelike-itch-web.zip` | **itch.io にアップロードするHTML5ゲーム本体**（ZIP直下に `index.html`、`assets/` は相対パス） |
| `party-roguelike-standalone.html` | ダブルクリックで遊べる単一HTML（別途ダウンロード配布したい場合用・任意） |

## 2. itch.io の設定
1. **Create new project** → *Kind of project*: **HTML**
2. ZIP をアップロードし **「This file will be played in the browser」** にチェック
3. **Embed options**
   - *Viewport dimensions*: **1280 × 720**（ゲームの論理解像度。画面に合わせて自動でFIT縮小されます）
   - **Mobile friendly** にチェック → *Orientation*: **Landscape**
   - **Fullscreen button** にチェック
   - *Automatically start on page load*: **オフ**（最初のクリック/タップで音声を開放する設計のため）
   - *Scrollbars* は無効のまま
4. 出品ページ
   - Cover image: `itch/cover-630x500.png` / Screenshots: `itch/screenshot-*.png`（`node scripts/make-itch-assets.cjs` で再生成可）
   - Genre: Role Playing / Tags 例: `roguelike`, `deckbuilder`, `turn-based`, `rpg`, `procedural-audio`, `browser`, `mobile`
   - Pricing / Community は任意

### 説明文の例
> 2人の冒険者（前衛ナイト＋後衛エレメンタリスト）でダンジョンに挑むローグライクRPG。
> 毎ターンのスキル選択とクールダウン、敵の「シールドゲージ」を削ってブレイク → 魔法でチェインを叩き込む連携が攻略の鍵。
> 装備ハクスラ（Common / Rare / Legendary）と、魔導石で街を復興して次回の初期能力を底上げする周回成長。
>
> **操作**: PCはクリック/ドラッグ（スキルを敵にドラッグ可）。スマホは**横向き**で、スキルを1回タップで詳細、もう一度タップで使用。
> セーブはブラウザ内(localStorage)に保存されます。

## 3. 仕様メモ
- 音声は WebAudio 合成（音声ファイル無し）、画像は `src/assets/img`（約1MB）を同梱。外部通信はありません。
- **スマホ**: 縦持ちには「横向きにしてください」を表示。タッチではタップで選択→再タップで使用／ドラッグでも使用可。全画面ボタンは対応ブラウザのみ表示（iPhoneのSafariは非対応のため出ません）。
- **音声**: 最初のクリック/タップ/キー入力で AudioContext を開放します。右上のスピーカーボタンでミュート（設定は保存）。
- **セーブ**: 拠点の強化・魔導石は `localStorage`。プライベートブラウズや保存を禁止した設定では、リロードで初期化されます（ゲーム自体は動作します）。
- itch.io に生成AIの利用開示欄がある場合は、制作実態に沿って回答してください。

## 4. 検証済み範囲と未検証
検証済み（自動）: ZIP構造 / サブパス配信 / 別オリジンiframe埋め込み / PC(マウス)とスマホ(タッチ・横向きエミュレーション)でのタイトル→戦闘 / 音声解錠 / localStorage / 404・コンソールエラー無し。
**未検証**: 実機の iOS Safari・Android Chrome での操作感・音の聴こえ方・描画性能（エミュレーションのため）。公開前に実機で一度お試しください。
