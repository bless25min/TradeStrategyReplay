# TradeStrategyReplay

券商／期貨策略歷史驗證與交易模擬平台。匯入「歷史商品報價」與「策略歷史交易紀錄」，在同一張 K 線上顯示策略進出場，同時保留原本 SoyaPlayableAd 的手動 BUY / SELL、持倉、保證金、浮動損益與平倉邏輯，讓使用者可以在相同歷史行情中比較「策略操作」與「自己的模擬操作」。

> 內建 `demo-txf` 為合成示範資料，只用來驗證介面與資料格式，不代表任何真實券商、期貨商或策略績效。

## 啟動

```bash
npm install
npm run dev
```

正式建置：

```bash
npm run build
```

## 目前完成

- React + TypeScript + Zustand + Lightweight Charts 5
- 策略清單與單策略資料載入
- 歷史 OHLC K 線
- 策略 LONG / SHORT 進場、出場與損益 Marker
- 使用者模擬交易 Marker 與策略 Marker 分色顯示
- 全覽 / 歷史重播
- 1x / 5x / 20x / 100x 播放
- 上一筆 / 下一筆策略交易跳轉
- 右側「策略交易 / 我的模擬」分頁
- 保留 BUY / SELL、模擬保證金、餘額、權益、浮動損益與手動平倉
- 累積策略損益、勝率、最大回撤、交易次數
- 瀏覽器直接匯入 `quotes.csv` + `trades.csv`
- 匯入時檢查資料期間、時間對齊與成交價是否超出 K 棒 High/Low
- 明確區分「歷史回測模擬 / 擬真紀錄 / 實盤紀錄」

## 靜態策略資料結構

```text
public/
  strategies/
    index.json
    <strategy-id>/
      meta.json
      quotes.csv
      trades.csv
```

### `quotes.csv`

必要欄位：

```csv
time,open,high,low,close,contract
2026-06-01T08:45:00+08:00,22150,22180,22130,22170,TXF202606
```

- `time`：建議 ISO 8601 並帶 timezone，例如 `+08:00`；也接受 Unix seconds / milliseconds。
- `contract`：期貨建議保留實際月份合約，避免換月後無法核對價格。

### `trades.csv`

必要欄位：

```csv
trade_id,side,entry_time,entry_price,exit_time,exit_price,qty,pnl_points,contract
1,LONG,2026-06-01T09:15:00+08:00,22180,2026-06-01T11:00:00+08:00,22320,1,140,TXF202606
```

`side` 接受：`LONG / SHORT / BUY / SELL / 多 / 空`。

額外可帶：

```text
pnl_amount, fees, slippage, net_pnl, note
```

正式績效數值應以回測／交易系統匯出的結果為準；前端只負責顯示、Replay 與 sanity check，不重新執行策略程式碼。

### `meta.json`

```json
{
  "id": "strategy-id",
  "name": "策略名稱",
  "platform": "上架平台",
  "instrument": "台指期",
  "symbol": "TXF",
  "timeframe": "15分鐘",
  "dataType": "backtest",
  "timezone": "Asia/Taipei",
  "utcOffset": "+08:00",
  "dataSource": "資料來源說明",
  "initialBalance": 1000000,
  "contractSize": 200,
  "leverage": 10
}
```

其中 `initialBalance / contractSize / leverage` 只用於「使用者自己的歷史模擬交易」；策略本身的績效不靠這些欄位重新計算。

`dataType`：

- `backtest`：歷史回測模擬
- `paper`：擬真紀錄
- `live`：歷史實盤紀錄

## 瀏覽器匯入

右上角「匯入策略資料」可直接選擇：

1. `quotes.csv`
2. `trades.csv`

資料只在瀏覽器記憶體中解析，不會自動上傳到伺服器。匯入完成後即可在圖表檢視與 Replay。

## 資料原則

1. Viewer 不執行策略程式碼；策略系統先產出交易紀錄，再交給 TradeStrategyReplay。
2. K 線資料與策略交易資料以 timestamp 對齊。
3. 期貨交易保留 `contract`，正式版處理換月時不要只用連續合約代號。
4. 策略 `pnl_points / net_pnl` 以來源系統匯出值為準。
5. 「策略交易」與「使用者模擬交易」在資料層、畫面標記與績效上完全分離。

## Lightweight Charts attribution

本專案使用 TradingView Lightweight Charts™。公開部署時請保留畫面中的 TradingView attribution，並遵循該套件授權要求。
