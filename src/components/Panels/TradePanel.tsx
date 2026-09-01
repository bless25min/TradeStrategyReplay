import { ArrowDown, ArrowUp } from 'lucide-react';
import { useStrategyStore } from '../../store/useStrategyStore';
import { formatTimestamp } from '../../utils/time';

export const TradePanel = () => {
  const trades = useStrategyStore((state) => state.trades);
  const selectedTradeId = useStrategyStore((state) => state.selectedTradeId);
  const meta = useStrategyStore((state) => state.meta);
  const selectTrade = useStrategyStore((state) => state.selectTrade);
  const selected = trades.find((trade) => trade.tradeId === selectedTradeId) ?? null;

  return <aside className="trade-panel">
    <div className="panel-heading"><div><span className="eyebrow-text">HISTORICAL TRADES</span><h2>歷史交易</h2></div><span className="trade-count">{trades.length}</span></div>
    {selected && meta && <div className="trade-detail">
      <div className="detail-top"><span className={`side-pill ${selected.side.toLowerCase()}`}>{selected.side === 'LONG' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{selected.side === 'LONG' ? '多單' : '空單'}</span><strong className={selected.pnlPoints >= 0 ? 'positive' : 'negative'}>{selected.pnlPoints >= 0 ? '+' : ''}{selected.pnlPoints.toFixed(0)} 點</strong></div>
      <div className="detail-grid">
        <div><span>進場</span><strong>{selected.entryPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.entryTime, meta.timezone)}</small></div>
        <div><span>出場</span><strong>{selected.exitPrice.toLocaleString()}</strong><small>{formatTimestamp(selected.exitTime, meta.timezone)}</small></div>
      </div>
      {selected.contract && <div className="detail-note">合約：{selected.contract}</div>}
    </div>}
    <div className="trade-list">{[...trades].reverse().map((trade) => <button key={trade.tradeId} className={`trade-row ${trade.tradeId === selectedTradeId ? 'selected' : ''}`} onClick={() => selectTrade(trade.tradeId)}>
      <span className={`direction-dot ${trade.side.toLowerCase()}`} />
      <span className="trade-main"><strong>#{trade.tradeId} · {trade.side === 'LONG' ? '多' : '空'}</strong><small>{meta ? formatTimestamp(trade.entryTime, meta.timezone) : ''}</small></span>
      <strong className={trade.pnlPoints >= 0 ? 'positive' : 'negative'}>{trade.pnlPoints >= 0 ? '+' : ''}{trade.pnlPoints.toFixed(0)}</strong>
    </button>)}</div>
  </aside>;
};
