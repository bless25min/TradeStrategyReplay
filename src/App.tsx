import { useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, Upload } from 'lucide-react';
import { StrategyChart } from './components/Chart/StrategyChart';
import { TradingDock } from './components/Controls/TradingDock';
import { TradingHUD } from './components/HUD/TradingHUD';
import { ImportDialog } from './components/Import/ImportDialog';
import { InspectorPanel } from './components/Panels/InspectorPanel';
import { useReplayLoop } from './hooks/useReplayLoop';
import { useTradingMarkToMarket } from './hooks/useTradingMarkToMarket';
import { useMarketStore } from './store/useMarketStore';
import { useStrategyStore } from './store/useStrategyStore';

function App() {
  const [importOpen, setImportOpen] = useState(false);
  const initialize = useStrategyStore((state) => state.initialize);
  const loadStrategy = useStrategyStore((state) => state.loadStrategy);
  const catalog = useStrategyStore((state) => state.catalog);
  const selectedStrategyId = useStrategyStore((state) => state.selectedStrategyId);
  const strategyMeta = useStrategyStore((state) => state.meta);
  const loading = useStrategyStore((state) => state.loading);
  const error = useStrategyStore((state) => state.error);
  const marketMeta = useMarketStore((state) => state.meta);
  const mode = useMarketStore((state) => state.mode);

  useReplayLoop();
  useTradingMarkToMarket();
  useEffect(() => { void initialize(); }, [initialize]);

  const isImported = strategyMeta && !catalog.some((item) => item.id === strategyMeta.id);
  const dataTypeLabel = strategyMeta?.dataType === 'live'
    ? '歷史實盤'
    : strategyMeta?.dataType === 'paper'
      ? '歷史擬真'
      : '歷史回測';

  if (loading && !strategyMeta) return <div className="center-state"><LoaderCircle className="spin" size={34} /><strong>載入歷史市場...</strong></div>;
  if (error && !strategyMeta) return <div className="center-state error-state"><AlertTriangle size={36} /><strong>無法啟動 TradeStrategyReplay</strong><span>{error}</span><button onClick={() => window.location.reload()}>重新載入</button></div>;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">TS</span>
        <div><strong>TradeStrategyReplay</strong><small>Historical Strategy Replay</small></div>
      </div>

      <div className="topbar-context">
        <strong>{strategyMeta?.name ?? '未選擇策略'}</strong>
        <span>{strategyMeta?.platform ?? '--'}</span>
        <i>{dataTypeLabel}</i>
        <i className={mode === 'replay' ? 'replay-live' : ''}>{mode === 'replay' ? 'REPLAY' : 'OVERVIEW'}</i>
      </div>

      <div className="topbar-actions">
        <select aria-label="選擇策略" value={selectedStrategyId ?? ''} onChange={(event) => void loadStrategy(event.target.value)}>
          {isImported && strategyMeta && <option value={strategyMeta.id}>{strategyMeta.name}（本機）</option>}
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button className="import-button" onClick={() => setImportOpen(true)}><Upload size={16} /><span>匯入</span></button>
      </div>
    </header>

    <TradingHUD />

    <main className="workspace">
      <section className="market-stage">
        <div className="chart-stage">
          <StrategyChart />
          <div className="market-context-badge">
            <strong>{marketMeta?.symbol ?? '--'}</strong>
            <span>{marketMeta?.timeframe ?? '--'}</span>
            <small>{strategyMeta?.tradeSource ?? marketMeta?.quoteSource ?? ''}</small>
          </div>
        </div>
        <TradingDock />
      </section>
      <InspectorPanel />
    </main>

    <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
  </div>;
}

export default App;
