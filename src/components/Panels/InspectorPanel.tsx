import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useStrategyStore } from '../../store/useStrategyStore';
import { formatTimestamp } from '../../utils/time';

export const InspectorPanel = () => {
  const [tab, setTab] = useState<'strategy' | 'manual'>('strategy');
  const strategyTrades = useStrategyStore((state) => state.trades);
  const selectedTradeId = useStrategyStore((state) => state.selectedTradeId);
  const manualOpen = useStrategyStore((state) => state.openManualPositions);
  const manualHistory = useStrategyStore((state) => state.manualTradeHistory);
  const meta = useStrategyStore((state) => state.meta);
  const selectTrade = useStrategyStore((state) => state.selectTrade);
  const closeManualPosition = useStrategyStore((state) => state.closeManualPosition);
  const selected = strategyTrades.find((trade) => trade.tradeId === selectedTradeId) ?? null;

  return <aside className="inspector-panel">
    <div className="inspector-tabs">
      <button className={tab === 'strategy' ? 'active' : ''} onClick={() => setTab('strategy')}>策略交易 <span>{strategyTrades.length}</span></button>
      <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>我的模擬 <span>{manualOpen.length}</span></button>
    </div>

    {tab === 'strategy' ? <>
      {selected && meta && <div className="trade-detail">
        <div className="detail-top">
          <span className={`side-pill ${selected.side.toLowerCase()}`}>{selected.side === 'LONG' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{selected.side === 'LONG' ? '多單' : '空單'}</span>
          <strong className={selected.pnlPoints >= 0 ? 'positive' : 'negative'}>{selected.pnlPoints >= 0 ? '+' : ''}{selected.pnlPoints.toFixed(0)} 點</strong>
        </div>
        <div className="detail-grid">
          <div><span>進場</span><strong>{selected.entryPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.entryTime, meta.timezone)}</small></div>
          <div><span>出場</span><strong>{selected.exitPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.exitTime, meta.timezone)}</small></div>
        </div>
        {selected.contract && <div className="detail-note">合約：{selected.contract}</div>}
      </div>}
      <div className="trade-list">{[...strategyTrades].reverse().map((trade) => <button key={trade.tradeId} className={`trade-row ${trade.tradeId === selectedTradeId ? 'selected' : ''}`} onClick={() => selectTrade(trade.tradeId)}>
        <span className={`direction-dot ${trade.side.toLowerCase()}`} />
        <span className="trade-main"><strong>#{trade.tradeId} · {trade.side === 'LONG' ? '多' : '空'}</strong><small>{meta ? formatTimestamp(trade.entryTime, meta.timezone) : ''}</small></span>
        <strong className={trade.pnlPoints >= 0 ? 'positive' : 'negative'}>{trade.pnlPoints >= 0 ? '+' : ''}{trade.pnlPoints.toFixed(0)}</strong>
      </button>)}</div>
    </> : <>
      <div className="manual-section-title">目前持倉</div>
      <div className="manual-list">
        {manualOpen.length === 0 && <div className="empty-state">目前沒有模擬持倉</div>}
        {manualOpen.map((trade) => <div key={trade.id} className="manual-position">
          <div><span className={`side-pill ${trade.side.toLowerCase()}`}>{trade.side === 'LONG' ? '多單' : '空單'}</span><strong>@ {trade.entryPrice.toLocaleString()}</strong></div>
          <small>{meta ? formatTimestamp(trade.entryTime, meta.timezone) : ''} · {trade.quantity} 口</small>
          <button onClick={() => closeManualPosition(trade.id)}><X size={14} />平倉</button>
        </div>)}
      </div>
      <div className="manual-section-title history">已平倉</div>
      <div className="trade-list">{[...manualHistory].reverse().map((trade) => <div key={trade.id} className="trade-row static-row">
        <span className={`direction-dot ${trade.side.toLowerCase()}`} />
        <span className="trade-main"><strong>{trade.side === 'LONG' ? '多' : '空'} · {trade.quantity} 口</strong><small>{meta && trade.closeTime ? formatTimestamp(trade.closeTime, meta.timezone) : ''}</small></span>
        <strong className={(trade.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>{(trade.pnl ?? 0) >= 0 ? '+' : ''}{(trade.pnl ?? 0).toFixed(0)}</strong>
      </div>)}</div>
    </>}
  </aside>;
};
