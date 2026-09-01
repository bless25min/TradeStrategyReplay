import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useMarketStore } from '../../store/useMarketStore';
import { useStrategyStore } from '../../store/useStrategyStore';
import { useTradingStore } from '../../store/useTradingStore';
import { findContainingBarIndex } from '../../utils/barLookup';

const SPEEDS = [0.5, 1, 2, 5, 10];

export const TradingDock = () => {
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mode = useMarketStore((state) => state.mode);
  const quotes = useMarketStore((state) => state.quotes);
  const currentIndex = useMarketStore((state) => state.currentIndex);
  const isPlaying = useMarketStore((state) => state.isPlaying);
  const speed = useMarketStore((state) => state.speed);
  const livePrice = useMarketStore((state) => state.livePrice);
  const setMode = useMarketStore((state) => state.setMode);
  const setPlaying = useMarketStore((state) => state.setPlaying);
  const setSpeed = useMarketStore((state) => state.setSpeed);
  const setCurrentIndex = useMarketStore((state) => state.setCurrentIndex);
  const strategyTrades = useStrategyStore((state) => state.trades);
  const jumpToTrade = useStrategyStore((state) => state.jumpToTrade);
  const placeOrder = useTradingStore((state) => state.placeOrder);
  const resetTrading = useTradingStore((state) => state.reset);

  const startReplay = () => {
    setMode('replay');
    const firstTrade = strategyTrades[0];
    const firstTradeIndex = firstTrade ? findContainingBarIndex(quotes, firstTrade.entryTime) : -1;
    setCurrentIndex(firstTradeIndex >= 0 ? Math.max(0, firstTradeIndex - 24) : 0);
    setFeedback(null);
  };

  const place = (side: 'LONG' | 'SHORT') => {
    const error = placeOrder(side, quantity);
    if (error) {
      setFeedback(error);
      return;
    }
    setFeedback(`${side === 'LONG' ? 'BUY' : 'SELL'} ${quantity} @ ${Number(livePrice ?? 0).toFixed(2)}`);
  };

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'SELECT' || target?.tagName === 'TEXTAREA') return;
      if (event.code === 'Space' && mode === 'replay') {
        event.preventDefault();
        setPlaying(!useMarketStore.getState().isPlaying);
      } else if (event.key.toLowerCase() === 'b' && mode === 'replay') {
        place('LONG');
      } else if (event.key.toLowerCase() === 's' && mode === 'replay') {
        place('SHORT');
      } else if (event.key === 'ArrowLeft' && mode === 'replay') {
        setCurrentIndex(Math.max(0, useMarketStore.getState().currentIndex - 1));
      } else if (event.key === 'ArrowRight' && mode === 'replay') {
        setCurrentIndex(Math.min(quotes.length - 1, useMarketStore.getState().currentIndex + 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, quotes.length, quantity]);

  return (
    <section className="trading-dock">
      <div className="dock-replay">
        <button className={`mode-chip ${mode === 'overview' ? 'active' : ''}`} onClick={() => setMode('overview')}>全覽</button>
        <button className={`mode-chip ${mode === 'replay' ? 'active' : ''}`} onClick={startReplay}>重播</button>
        <div className="transport-controls">
          <button className="transport-icon" disabled={mode !== 'replay'} onClick={() => jumpToTrade(-1)} title="上一筆策略交易"><SkipBack size={16} /></button>
          <button className="transport-icon" disabled={mode !== 'replay'} onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} title="上一根"><ChevronLeft size={18} /></button>
          <button className="transport-play" disabled={mode !== 'replay'} onClick={() => setPlaying(!isPlaying)} title="Space">
            {isPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
          </button>
          <button className="transport-icon" disabled={mode !== 'replay'} onClick={() => setCurrentIndex(Math.min(quotes.length - 1, currentIndex + 1))} title="下一根"><ChevronRight size={18} /></button>
          <button className="transport-icon" disabled={mode !== 'replay'} onClick={() => jumpToTrade(1)} title="下一筆策略交易"><SkipForward size={16} /></button>
        </div>
        <div className="speed-control">
          {SPEEDS.map((item) => <button key={item} className={speed === item ? 'active' : ''} onClick={() => setSpeed(item)}>{item}×</button>)}
        </div>
      </div>

      <div className="dock-scrubber">
        <input
          aria-label="歷史播放進度"
          type="range"
          min={0}
          max={Math.max(0, quotes.length - 1)}
          value={currentIndex}
          disabled={mode !== 'replay'}
          onChange={(event) => setCurrentIndex(Number(event.target.value))}
        />
      </div>

      <div className="dock-order">
        <div className="quantity-stepper">
          <span>LOTS</span>
          <div>
            <button onClick={() => setQuantity(Math.max(0.01, Number((quantity - 0.1).toFixed(2))))}><Minus size={15} /></button>
            <input type="number" min="0.01" step="0.1" value={quantity} onChange={(event) => setQuantity(Math.max(0.01, Number(event.target.value) || 0.01))} />
            <button onClick={() => setQuantity(Number((quantity + 0.1).toFixed(2)))}><Plus size={15} /></button>
          </div>
        </div>
        <button className="trade-action buy" disabled={mode !== 'replay'} onClick={() => place('LONG')}>
          <small>B</small><strong>BUY</strong><span>{Number.isFinite(livePrice) ? Number(livePrice).toFixed(2) : '--'}</span>
        </button>
        <button className="trade-action sell" disabled={mode !== 'replay'} onClick={() => place('SHORT')}>
          <small>S</small><strong>SELL</strong><span>{Number.isFinite(livePrice) ? Number(livePrice).toFixed(2) : '--'}</span>
        </button>
        <button className="dock-reset" onClick={() => { resetTrading(); setFeedback('模擬帳戶已重設'); }} title="重設模擬帳戶"><RotateCcw size={17} /></button>
      </div>

      {mode !== 'replay' && <button className="start-replay-callout" onClick={startReplay}><Play size={17} fill="currentColor" />開始歷史重播並模擬交易</button>}
      {feedback && <div className={`order-feedback ${feedback.includes('不足') || feedback.includes('必須') ? 'error' : ''}`}>{feedback}</div>}
    </section>
  );
};
