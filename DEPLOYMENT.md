# TradeStrategyReplay Deployment

本專案建議直接使用 Cloudflare Pages 的 GitHub integration 部署，不需要 Wrangler 或額外的 GitHub Actions deploy workflow。

## Cloudflare Pages 設定

在 Cloudflare Dashboard：

`Workers & Pages → Create application → Pages → Connect to Git`

選擇 GitHub repository：

```text
bless25min/TradeStrategyReplay
```

設定：

```text
Production branch: main
Build command: npm run build
Build output directory: dist
Root directory: /
```

Project name 建議使用：

```text
trade-strategy-replay
```

部署後網址會是：

```text
https://trade-strategy-replay.pages.dev
```

每次 push 到 `main`，Cloudflare Pages 會自動重新 build 與部署；其他 branch / PR 可產生 preview deployment。

## 與 SoyaPlayableAd 隔離

只要建立新的 Pages project 並選擇 `TradeStrategyReplay` repository，就不會影響：

```text
SoyaPlayableAd
soyaplayablead.pages.dev
```

請不要把新 repository 接到既有 `soyaplayablead` Pages project，也不要重新綁定舊專案正在使用的 hostname。

## 靜態站設定

Repository 已包含：

```text
public/_redirects
public/_headers
```

`_redirects` 提供 SPA fallback；`_headers` 提供基本安全標頭與靜態資料 cache policy。

## 自訂網域

確認 `trade-strategy-replay.pages.dev` 正常後，再於這個新 Pages project 綁定獨立子網域，例如：

```text
replay.wintrade.tw
strategy.wintrade.tw
```

不要移除或重新指向既有 SoyaPlayableAd 使用中的網域。