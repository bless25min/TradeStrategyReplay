# TradeStrategyReplay

券商／期貨策略歷史驗證與交易模擬平台。將「市場歷史報價」、「策略歷史交易紀錄」與「使用者模擬交易」拆成三個獨立 domain，在同一張 K 線與同一條 Replay 時間軸上疊加顯示。

> 內建 `demo-txf` 為合成示範資料，只用來驗證介面與資料格式，不代表任何真實券商、期貨商或策略績效。

## 核心架構

```text
Market
  歷史 OHLC / 合約 / Session / Replay Clock
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
Strategy Overlay       Manual Trading
歷史進出場             BUY / SELL
策略損益               Position / Margin
交易紀錄               Balance / Equity / P&L
        └─────────┬─────────┘
                  ▼
                 Chart
```

### Market

負責共用行情與 Replay。相同市場的多支策略共用同一份歷史報價，不在每支策略資料夾重複保存 K 線。

### Strategy

只保存策略自己的 metadata、`marketId` 與歷史交易紀錄。Viewer 不執行策略程式碼、不重新回測。

### Manual Trading

保留原本 SoyaPlayableAd 的手動 BUY / SELL、模擬保證金、持倉、浮動損益、權益與平倉邏輯，但資料與策略績效完全分離。

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
- Market / Strategy / Manual Trading 三層 store
- 共用 Market Data，策略透過 `marketId` 引用市場
- 歷史 OHLC K 線
- 策略 LONG / SHORT 進場、出場與損益 Marker
- 使用者模擬交易 Marker 與策略 Marker 分色顯示
- 全覽 / 歷史重播
- 1x / 5x / 20x / 100x 播放
- 上一筆 / 下一筆策略交易跳轉
- 右側「策略交易 / 我的模擬」分頁
- BUY / SELL、模擬保證金、餘額、權益、浮動損益與手動平倉
- 累積策略損益、勝率、最大回撤、交易次數
- 瀏覽器直接匯入 `quotes.csv` + `trades.csv`
- CSV 匯入後轉成標準化 Market / Strategy 物件再供 UI 使用
- 成交時間使用「所屬 K 棒」對齊，不再用 nearest-bar 配對
- 匯入時檢查期間、K 棒歸屬、High/Low 與期貨合約一致性
- 明確區分「歷史回測模擬 / 擬真紀錄 / 實盤紀錄」

## 靜態資料結構

```text
public/
  markets/
    index.json
    <market-id>/
      meta.json
      quotes.csv              # Demo 可用
      2026-01.json            # 正式版可按月切片
      2026-02.json

  strategies/
    index.json
    <strategy-id>/
      meta.json
      trades.csv              # 或 normalized trades.json
```

重點是：**行情屬於 Market，不屬於 Strategy。**

例如三支台指期策略可以全部指向同一個 `marketId: "TXF-M15"`，而不是各自保存三份相同 K 線。

## Market metadata

```json
{
  "id": "TXF-M15",
  "instrument": "台指期",
  "symbol": "TXF",
  "timeframe": "15分鐘",
  "timezone": "Asia/Taipei",
  "utcOffset": "+08:00",
  "quoteSource": "行情來源",
  "session": "regular+after-hours",
  "priceAdjustment": "none",
  "contractMode": "actual",
  "quoteFormat": "json",
  "quoteFiles": [
    "2026-01.json",
    "2026-02.json"
  ]
}
```

`quoteFiles` 支援多檔載入，因此正式歷史資料可以按月／季切片，而不需要把多年 5 分 K 打包成一個巨大檔案。

## Strategy metadata

```json
{
  "id": "strategy-id",
  "name": "策略名稱",
  "platform": "上架平台",
  "marketId": "TXF-M15",
  "dataType": "backtest",
  "tradeSource": "回測／交易系統來源",
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

## CSV 匯入格式

CSV 是外部資料交換／匯入格式。瀏覽器匯入後，程式會先 parse + validate，再轉成標準化 Market / Strategy 資料模型；Chart、Replay 與 Trading 不直接依賴 CSV 欄位。

### `quotes.csv`

```csv
time,open,high,low,close,contract
2026-06-01T08:45:00+08:00,22150,22180,22130,22170,TXF202606
```

- `time`：建議 ISO 8601 並帶 timezone，例如 `+08:00`；也接受 Unix seconds / milliseconds。
- `contract`：期貨建議保留實際月份合約，避免換月後無法核對價格。

### `trades.csv`

```csv
trade_id,side,entry_time,entry_price,exit_time,exit_price,qty,pnl_points,contract
1,LONG,2026-06-01T09:17:32+08:00,22180,2026-06-01T11:04:18+08:00,22320,1,140,TXF202606
```

交易時間不必剛好等於 K 棒起始時間。系統會依區間判斷，例如 15 分 K 中 `09:17:32` 屬於 `09:15:00–09:29:59` 的 K 棒。

`side` 接受：`LONG / SHORT / BUY / SELL / 多 / 空`。

額外可帶：

```text
pnl_amount, fees, slippage, net_pnl, note
```

策略正式績效以來源回測／交易系統匯出的 `pnl_points / net_pnl` 為準；前端只負責顯示、Replay 與 sanity check。

## 資料驗證原則

1. 策略進出場必須落在 Market 歷史資料期間內。
2. 交易時間使用 containing-bar 規則對齊，而不是找距離最近的 K 棒。
3. 進出場價格會與該時間所屬 K 棒 High/Low 比對。
4. 若交易與 K 棒都有 `contract`，會檢查月份合約是否一致。
5. 正式展示行情最好與產生策略交易紀錄的行情使用相同資料來源與調整方式。
6. Market metadata 保留 `quoteSource / session / priceAdjustment / contractMode`，避免不同資料口徑被混用。

## 正式資料建議

MVP 可直接使用 CSV。資料量放大後，建議在後台 Importer 完成：

```text
CSV / Excel / 回測匯出
        ↓
Parser
        ↓
Validation
        ↓
Normalized data
        ↓
按月／季切片 JSON
        ↓
TradeStrategyReplay
```

因此未來增加更多策略時，只需要新增 Strategy trades；同一市場行情可以直接共用。

## Lightweight Charts attribution

本專案使用 TradingView Lightweight Charts™。公開部署時請保留畫面中的 TradingView attribution，並遵循該套件授權要求。
