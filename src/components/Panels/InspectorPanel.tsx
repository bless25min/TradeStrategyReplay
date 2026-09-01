import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useMarketStore } from '../../store/useMarketStore';
import { useStrategyStore } from '../../store/useStrategyStore';
import { useTradingStore } from '../../store/useTradingStore';
import { calculateMetrics } from '../../utils/metrics';
import { formatTimestamp } from '../../utils/time';

const formatMoney = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });

export const InspectorPanel = () => {
  const [tab, setTab] = useState<'positions' | 'strategy' | 'history'>('positions');
  const strategyTrades = useStrategyStore((state) => state.trades);
  const strategyMeta = useStrategyStore((state) => state.meta);
  const selectedTradeId = useStrategyStore((state) => state.selectedTradeId);
  const selectTrade = useStrategyStore((state) => state.selectTrade);
  const marketMeta = useMarketStore((state) => state.meta);
  const livePrice = useMarketStore((state) => state.livePrice);
  const manualOpen = useTradingStore((state) => state.openPositions);
  const manualHistory = useTradingStore((state) => state.history);
  const contractSize = useTradingStore((state) => state.config.contractSize);
  const closePosition = useTradingStore((state) => state.closePosition);
  const selected = strategyTrades.find((trade) => trade.tradeId === selectedTradeId) ?? null;
  const metrics = useMemo(() => calculateMetrics(strategyTrades), [strategyTrades]);

  return (
    <aside className="inspector-panel">
      <div className="panel-strategy-summary">
        <span>{strategyMeta?.platform ?? 'STRATEGY'}</span>
        <strong>{strategyMeta?.name ?? '未選擇策略'}</strong>
        <div>
          <small>{metrics.tradeCount} 筆</small>
          <small className={metrics.totalPnlPoints >= 0 ? 'positive' : 'negative'}>{metrics.totalPnlPoints >= 0 ? '+' : ''}{metrics.totalPnlPoints.toFixed(0)} pts</small>
          <small>{metrics.winRate.toFixed(1)}% 勝率</small>
        </div>
      </div>

      <div className="inspector-tabs">
        <button className={tab === 'positions' ? 'active' : ''} onClick={() => setTab('positions')}>持倉 <span>{manualOpen.length}</span></button>
        <button className={tab === 'strategy' ? 'active' : ''} onClick={() => setTab('strategy')}>策略 <span>{strategyTrades.length}</span></button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>紀錄 <span>{manualHistory.length}</span></button>
      </div>

      {tab === 'positions' && <div className="panel-scroll positions-list">
        {manualOpen.length === 0 && <div className="empty-state"><strong>目前沒有持倉</strong><span>開始歷史重播後，可用下方 BUY / SELL 建立模擬部位。</span></div>}
        {manualOpen.map((trade) => {
          const price = Number(livePrice ?? trade.entryPrice);
          const diff = trade.side === 'LONG' ? price - trade.entryPrice : trade.entryPrice - price;
          const pnl = diff * trade.quantity * contractSize;
          return <div key={trade.id} className="position-card">
            <div className="position-card-top">
              <span className={`side-pill ${trade.side.toLowerCase()}`}>{trade.side === 'LONG' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{trade.side === 'LONG' ? 'BUY' : 'SELL'} {trade.quantity}</span>
              <strong className={pnl >= 0 ? 'positive' : 'negative'}>{pnl >= 0 ? '+' : ''}{formatMoney(pnl)}</strong>
            </div>
            <div className="position-prices"><span>Entry <b>{trade.entryPrice.toFixed(2)}</b></span><span>Now <b>{price.toFixed(2)}</b></span></div>
            <small>{marketMeta ? formatTimestamp(trade.entryTime, marketMeta.timezone) : ''}</small>
            <button className="close-position-button" onClick={() => closePosition(trade.id)}><X size={14} />平倉</button>
          </div>;
        })}
      </div>}

      {tab === 'strategy' && <>
        {selected && marketMeta && <div className="trade-detail">
          <div className="detail-top">
            <span className={`side-pill ${selected.side.toLowerCase()}`}>{selected.side === 'LONG' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{selected.side === 'LONG' ? '多單' : '空單'}</span>
            <strong className={selected.pnlPoints >= 0 ? 'positive' : 'negative'}>{selected.pnlPoints >= 0 ? '+' : ''}{selected.pnlPoints.toFixed(1)} 點</strong>
          </div>
          <div className="detail-grid">
            <div><span>進場</span><strong>{selected.entryPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.entryTime, marketMeta.timezone)}</small></div>
            <div><span>出場</span><strong>{selected.exitPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.exitTime, marketMeta.timezone)}</small></div>
          </div>
        </div>}
        <div className="panel-scroll trade-list">{[...strategyTrades].reverse().map((trade) => <button key={trade.tradeId} className={`trade-row ${trade.tradeId === selectedTradeId ? 'selected' : ''}`} onClick={() => selectTrade(trade.tradeId)}>
          <span className={`direction-dot ${trade.side.toLowerCase()}`} />
          <span className="trade-main"><strong>#{trade.tradeId} · {trade.side === 'LONG' ? 'BUY' : 'SELL'}</strong><small>{marketMeta ? formatTimestamp(trade.entryTime, marketMeta.timezone) : ''}</small></span>
          <strong className={trade.pnlPoints >= 0 ? 'positive' : 'negative'}>{trade.pnlPoints >= 0 ? '+' : ''}{trade.pnlPoints.toFixed(1)}</strong>
        </button>)}</div>
      </>}

      {tab === 'history' && <div className="panel-scroll trade-list">
        {manualHistory.length === 0 && <div className="empty-state"><strong>尚無交易紀錄</strong><span>平倉後會顯示在這裡。</span></div>}
        {[...manualHistory].reverse().map((trade) => <div key={trade.id} className="trade-row static-row">
          <span className={`direction-dot ${trade.side.toLowerCase()}`} />
          <span className="trade-main"><strong>{trade.side === 'LONG' ? 'BUY' : 'SELL'} · {trade.quantity}</strong><small>{marketMeta && trade.closeTime ? formatTimestamp(trade.closeTime, marketMeta.timezone) : ''}</small></span>
          <strong className={(trade.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>{(trade.pnl ?? 0) >= 0 ? '+' : ''}{formatMoney(trade.pnl ?? 0)}</strong>
        </div>)}
      </div>}

      <div className="panel-disclaimer">歷史資料展示與模擬交易，不構成即時交易訊號。</div>
    </aside>
  );
};
