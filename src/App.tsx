import { useEffect, useMemo, useState } from 'react';
import { Upload, LoaderCircle, AlertTriangle } from 'lucide-react';
import { StrategyHeader } from './components/Header/StrategyHeader';
import { StrategyChart } from './components/Chart/StrategyChart';
import { ReplayControls } from './components/Controls/ReplayControls';
import { TradingControls } from './components/Controls/TradingControls';
import { InspectorPanel } from './components/Panels/InspectorPanel';
import { ImportDialog } from './components/Import/ImportDialog';
import { useMarketStore } from './store/useMarketStore';
import { useStrategyStore } from './store/useStrategyStore';
import { useReplayLoop } from './hooks/useReplayLoop';
import { useTradingMarkToMarket } from './hooks/useTradingMarkToMarket';
import { calculateMetrics } from './utils/metrics';

function App() {
  const [importOpen, setImportOpen] = useState(false);
  const initialize = useStrategyStore((state) => state.initialize);
  const loadStrategy = useStrategyStore((state) => state.loadStrategy);
  const catalog = useStrategyStore((state) => state.catalog);
  const selectedStrategyId = useStrategyStore((state) => state.selectedStrategyId);
  const strategyMeta = useStrategyStore((state) => state.meta);
  const trades = useStrategyStore((state) => state.trades);
  const loading = useStrategyStore((state) => state.loading);
  const error = useStrategyStore((state) => state.error);
  const marketMeta = useMarketStore((state) => state.meta);

  useReplayLoop();
  useTradingMarkToMarket();
  useEffect(() => { void initialize(); }, [initialize]);
  const metrics = useMemo(() => calculateMetrics(trades), [trades]);
  const isImported = strategyMeta && !catalog.some((item) => item.id === strategyMeta.id);

  if (loading && !strategyMeta) return <div className="center-state"><LoaderCircle className="spin" size={32} /><strong>載入策略與市場資料...</strong></div>;
  if (error && !strategyMeta) return <div className="center-state error-state"><AlertTriangle size={34} /><strong>無法啟動 TradeStrategyReplay</strong><span>{error}</span></div>;

  return <div className="app-shell">
    <nav className="topbar">
      <div className="brand"><span className="brand-mark">TS</span><div><strong>TradeStrategyReplay</strong><small>Strategy × Historical Market Replay</small></div></div>
      <div className="topbar-actions">
        <select aria-label="選擇策略" value={selectedStrategyId ?? ''} onChange={(event) => void loadStrategy(event.target.value)}>
          {isImported && strategyMeta && <option value={strategyMeta.id}>{strategyMeta.name}（本機匯入）</option>}
          {catalog.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button className="import-button" onClick={() => setImportOpen(true)}><Upload size={16} />匯入策略資料</button>
      </div>
    </nav>

    {strategyMeta && marketMeta && <StrategyHeader strategy={strategyMeta} market={marketMeta} metrics={metrics} />}

    <main className="workspace">
      <section className="chart-column">
        <StrategyChart />
        <ReplayControls />
        <TradingControls />
      </section>
      <InspectorPanel />
    </main>

    <footer className="disclaimer-bar">
      <strong>{strategyMeta?.dataType === 'backtest' ? '歷史回測模擬' : strategyMeta?.dataType === 'paper' ? '歷史擬真紀錄' : '歷史實盤紀錄'}</strong>
      <span>圖示策略進出場僅呈現已匯入之歷史資料，非即時交易訊號。使用者 BUY / SELL 為歷史行情中的模擬交易。</span>
      {strategyMeta?.disclaimer && <span>{strategyMeta.disclaimer}</span>}
    </footer>

    <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
  </div>;
}

export default App;
