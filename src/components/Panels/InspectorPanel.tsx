import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useMarketStore } from '../../store/useMarketStore';
import { useStrategyStore } from '../../store/useStrategyStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatTimestamp } from '../../utils/time';

export const InspectorPanel = () => {
  const [tab, setTab] = useState<'strategy' | 'manual'>('strategy');
  const strategyTrades = useStrategyStore((state) => state.trades);
  const selectedTradeId = useStrategyStore((state) => state.selectedTradeId);
  const selectTrade = useStrategyStore((state) => state.selectTrade);
  const marketMeta = useMarketStore((state) => state.meta);
  const manualOpen = useTradingStore((state) => state.openPositions);
  const manualHistory = useTradingStore((state) => state.history);
  const closePosition = useTradingStore((state) => state.closePosition);
  const selected = strategyTrades.find((trade) => trade.tradeId === selectedTradeId) ?? null;

  return <aside className="inspector-panel">
    <div className="inspector-tabs">
      <button className={tab === 'strategy' ? 'active' : ''} onClick={() => setTab('strategy')}>策略交易 <span>{strategyTrades.length}</span></button>
      <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>我的模擬 <span>{manualOpen.length}</span></button>
    </div>

    {tab === 'strategy' ? <>
      {selected && marketMeta && <div className="trade-detail">
        <div className="detail-top">
          <span className={`side-pill ${selected.side.toLowerCase()}`}>{selected.side === 'LONG' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{selected.side === 'LONG' ? '多單' : '空單'}</span>
          <strong className={selected.pnlPoints >= 0 ? 'positive' : 'negative'}>{selected.pnlPoints >= 0 ? '+' : ''}{selected.pnlPoints.toFixed(0)} 點</strong>
        </div>
        <div className="detail-grid">
          <div><span>進場</span><strong>{selected.entryPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.entryTime, marketMeta.timezone)}</small></div>
          <div><span>出場</span><strong>{selected.exitPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.exitTime, marketMeta.timezone)}</small></div>
        </div>
        {selected.contract && <div className="detail-note">合約：{selected.contract}</div>}
      </div>}
      <div className="trade-list">{[...strategyTrades].reverse().map((trade) => <button key={trade.tradeId} className={`trade-row ${trade.tradeId === selectedTradeId ? 'selected' : ''}`} onClick={() => selectTrade(trade.tradeId)}>
        <span className={`direction-dot ${trade.side.toLowerCase()}`} />
        <span className="trade-main"><strong>#{trade.tradeId} · {trade.side === 'LONG' ? '多' : '空'}</strong><small>{marketMeta ? formatTimestamp(trade.entryTime, marketMeta.timezone) : ''}</small></span>
        <strong className={trade.pnlPoints >= 0 ? 'positive' : 'negative'}>{trade.pnlPoints >= 0 ? '+' : ''}{trade.pnlPoints.toFixed(0)}</strong>
      </button>)}</div>
    </> : <>
      <div className="manual-section-title">目前持倉</div>
      <div className="manual-list">
        {manualOpen.length === 0 && <div className="empty-state">目前沒有模擬持倉</div>}
        {manualOpen.map((trade) => <div key={trade.id} className="manual-position">
          <div><span className={`side-pill ${trade.side.toLowerCase()}`}>{trade.side === 'LONG' ? '多單' : '空單'}</span><strong>@ {trade.entryPrice.toLocaleString()}</strong></div>
          <small>{marketMeta ? formatTimestamp(trade.entryTime, marketMeta.timezone) : ''} · {trade.quantity} 口</small>
          <button onClick={() => closePosition(trade.id)}><X size={14} />平倉</button>
        </div>)}
      </div>
      <div className="manual-section-title history">已平倉</div>
      <div className="trade-list">{[...manualHistory].reverse().map((trade) => <div key={trade.id} className="trade-row static-row">
        <span className={`direction-dot ${trade.side.toLowerCase()}`} />
        <span className="trade-main"><strong>{trade.side === 'LONG' ? '多' : '空'} · {trade.quantity} 口</strong><small>{marketMeta && trade.closeTime ? formatTimestamp(trade.closeTime, marketMeta.timezone) : ''}</small></span>
        <strong className={(trade.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>{(trade.pnl ?? 0) >= 0 ? '+' : ''}{(trade.pnl ?? 0).toFixed(0)}</strong>
      </div>)}</div>
    </>}
  </aside>;
};
