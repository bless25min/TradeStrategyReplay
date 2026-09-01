import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useStrategyStore } from '../../store/useStrategyStore';

export const TradingControls = () => {
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const mode = useStrategyStore((state) => state.mode);
  const balance = useStrategyStore((state) => state.balance);
  const equity = useStrategyStore((state) => state.equity);
  const floatingPL = useStrategyStore((state) => state.floatingPL);
  const openCount = useStrategyStore((state) => state.openManualPositions.length);
  const placeManualOrder = useStrategyStore((state) => state.placeManualOrder);
  const resetManualTrading = useStrategyStore((state) => state.resetManualTrading);

  const place = (side: 'LONG' | 'SHORT') => {
    const error = placeManualOrder(side, quantity);
    setMessage(error);
  };

  return <div className="trading-controls">
    <div className="account-strip">
      <div><span>模擬餘額</span><strong>{balance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
      <div><span>權益</span><strong>{equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
      <div><span>浮動損益</span><strong className={floatingPL >= 0 ? 'positive' : 'negative'}>{floatingPL >= 0 ? '+' : ''}{floatingPL.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
      <div><span>持倉</span><strong>{openCount}</strong></div>
    </div>
    <div className="order-strip">
      <label>數量<input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
      <button className="buy-button" disabled={mode !== 'replay'} onClick={() => place('LONG')}>BUY 多單</button>
      <button className="sell-button" disabled={mode !== 'replay'} onClick={() => place('SHORT')}>SELL 空單</button>
      <button className="reset-button" onClick={() => { resetManualTrading(); setMessage(null); }} title="重設模擬帳戶"><RotateCcw size={16} />重設</button>
    </div>
    {mode !== 'replay' && <div className="control-hint">切換到「歷史重播」後即可在同一段歷史行情中自行模擬交易，並與策略進出場比較。</div>}
    {message && <div className="control-error">{message}</div>}
  </div>;
};
