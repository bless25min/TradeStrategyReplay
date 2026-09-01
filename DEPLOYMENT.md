# TradeStrategyReplay Deployment

本專案使用獨立 Cloudflare Pages project：

```text
trade-strategy-replay
```

預期 Pages 網址：

```text
https://trade-strategy-replay.pages.dev
```

這個部署設定不會修改或覆蓋 `SoyaPlayableAd` / `soyaplayablead.pages.dev`。

## 一次性設定

在 GitHub repository `bless25min/TradeStrategyReplay` 的：

`Settings → Secrets and variables → Actions → Repository secrets`

新增兩個只給本專案使用的 Secrets：

```text
TRADE_STRATEGY_REPLAY_CF_API_TOKEN
TRADE_STRATEGY_REPLAY_CF_ACCOUNT_ID
```

Cloudflare API Token 必須具有建立與部署 Cloudflare Pages project 所需的帳號權限。請只授權需要部署的 Cloudflare Account，不要把 Token 寫進 repository。

## 第一次部署

GitHub：

`Actions → Deploy TradeStrategyReplay to Cloudflare Pages → Run workflow`

Workflow 會依序：

1. `npm install`
2. `npm run build`
3. 檢查本專案專用 Cloudflare Secrets
4. 檢查 `trade-strategy-replay` Pages project 是否存在
5. 若不存在，只建立 `trade-strategy-replay`
6. 將 `dist/` 發布到該 project 的 `main` production branch

部署 workflow 不會使用 `soyaplayablead` 作為 project name，也不包含舊專案的 Worker / LINE Login 設定。

## Cloudflare Pages build contract

Repository 已固定：

```text
Build command: npm run build
Output directory: dist
Project name: trade-strategy-replay
Production branch: main
```

`wrangler.toml`：

```toml
name = "trade-strategy-replay"
pages_build_output_dir = "./dist"
```

## 靜態站設定

`public/_redirects` 提供 SPA fallback：

```text
/* /index.html 200
```

`public/_headers` 提供基本安全標頭與 assets / markets / strategies cache policy。

## 後續自訂網域

確認 `trade-strategy-replay.pages.dev` 正常後，再於這個 Pages project 綁定獨立子網域，例如：

```text
replay.wintrade.tw
strategy.wintrade.tw
```

不要移除或重新指向既有 `SoyaPlayableAd` 使用的 hostname。
