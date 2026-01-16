# Copilot 指示: Neon Survivor

このリポジトリで作業する AI への短いガイドです。内容は日本語で更新しています。

## 全体像
- ビルド無しのシングルページゲーム。`index.html` を開けば動作します。
- Web Audio API を使った動的 BGM と、Canvas 2D 描画が中心です。
- 状態はグローバルで管理し、配列の破壊的更新（`splice` など）を前提にしています。

## 主要ファイル
- `index.html`：UI 要素（オーバーレイ、音量パネル、タッチ用ジョイスティック、警告表示）とスクリプト読み込み順を定義。
- `js/Neon_Suvivor.js`：メインループ、入力、`gameState`、スポーン、UI 更新、スコア保存。
- `js/data.js`：`weaponsInitial` / `upgrades` / `enemyTypes` などのバランスデータ。
- `js/entities.js`：`Bullet` / `RotatingBlade` / `BombProjectile` / `Landmine` などの共通クラス。
- `js/bosses.js`：ボスクラス群と `createRandomBoss`。
- `js/audio.js`：`SoundManager`（BGM スケジューラ、SE、ボスモード/エラー演出）。

## ゲーム進行の要点
- `gameState` は `"start"`, `"playing"`, `"levelup"`, `"gameover"` を使い分け。
- `frameCount` は毎フレーム加算、`timeSeconds` は 60 フレームごとに加算。
- 30 秒ごとに `wave` が進行し、`wave % 5 === 0` でボス出現。
- `world` は 3000x3000。`camera` は追従、境界を描画。
- 敵 HP は `enemyBaseHp` を基準に波数で増加（30 波以降は増加量が変化）。

## 入力/UI の挙動
- キーボード移動: `WASD` または矢印キー。
- タッチ移動: `#touchControls` のジョイスティックを使用（モバイル検出時に表示）。
- レベルアップ選択: マウス/タッチでカード選択、キーボードは `A/D` で選択、`Space` で確定。
- ゲームオーバー時はクリック/タップで `resetGame()` → 再開。
- 起動時は Start ボタン押下で `soundManager.init()` と `startBGM()` を実行（自動再生制限対策）。

## 描画の注意点
- `canvas` は `devicePixelRatio` に合わせて拡大縮小済み。
- 画面全体の描画や UI は `cssWidth/cssHeight` を使う。
- ワールド描画は `camera.zoom` と `viewWidth/viewHeight` を前提にする。

## オーディオの注意点
- `SoundManager` はユーザー操作後に `init()` が必要。
- `setWave()` でテンポが変化し、`setBossMode(true)` で更に加速。
- 有効クールダウンが 9 フレーム未満になると `triggerOverheatSequence()` が動作（`sanctuary`/`blade` は除外）。
- `#systemError` の表示は `SoundManager.setSystemError()` で制御。

## データ駆動の追加ルール
- 新武器は `js/data.js` の `weaponsInitial` に追加。
- 実動作は `js/Neon_Suvivor.js` の `player.weapons.forEach` 内に実装。
- 新しい投射物やエフェクトが必要なら `js/entities.js` にクラスを追加。
- SE は `js/audio.js` の `SoundManager` にメソッドを追加し、武器処理から呼ぶ。
- 新ボスは `js/bosses.js` にクラス追加し、`createRandomBoss()` の配列に登録。

## 永続データ
- スコアは `localStorage` の `neonSurvivorScores` に上位 5 件保存。

## 実行・デバッグ
- 直接 `index.html` を開くか、`python -m http.server` で静的配信（`file://` 制限回避）。
- コンソールで `resetGame()` / `spawnBoss()` / `soundManager.startBGM()` / `soundManager.setWave(n)` が利用可能。

## パフォーマンス/安全
- フレーム内処理が重くならないよう、ループやオブジェクト生成は最小限に。
- `marked` フラグの削除は既存の `splice` パターンに合わせる。

不明点や追記したい項目があれば、どのセクションを拡張するか教えてください。
