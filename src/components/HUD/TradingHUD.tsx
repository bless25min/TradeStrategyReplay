import { useMemo } from 'react';
import { useMarketStore } from '../../store/useMarketStore';
import { useStrategyStore } from '../../store/useStrategyStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatTimestamp } from '../../utils/time';

const formatNumber = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits });

export const TradingHUD = () => {
  const quotes = useMarketStore((state) => state.quotes);
  const market = useMarketStore((state) => state.meta);
  const mode = useMarketStore((state) => state.mode);
  const currentIndex = useMarketStore((state) => state.currentIndex);
  const barProgress = useMarketStore((state) => state.barProgress);
  const livePrice = useMarketStore((state) => state.livePrice);
  const strategy = useStrategyStore((state) => state.meta);
  const balance = useTradingStore((state) => state.balance);
  const equity = useTradingStore((state) => state.equity);
  const floatingPL = useTradingStore((state) => state.floatingPL);
  const positionCount = useTradingStore((state) => state.openPositions.length);

  const progress = useMemo(() => {
    if (quotes.length <= 1) return 0;
    const raw = mode === 'overview' ? 1 : (currentIndex + barProgress) / (quotes.length - 1);
    return Math.max(0, Math.min(1, raw));
  }, [quotes.length, mode, currentIndex, barProgress]);

  const bar = quotes[currentIndex];
  const timestamp = bar && market
    ? formatTimestamp(bar.time, market.timezone)
    : '--';

  return (
    <section className="hud-strip">
      <div className="hud-market">
        <strong>{market?.symbol ?? '--'}</strong>
        <span>{market?.instrument ?? '尚未載入行情'} · {market?.timeframe ?? '--'}</span>
      </div>
      <div className="hud-metric">
        <span>PRICE</span>
        <strong>{Number.isFinite(livePrice) ? formatNumber(Number(livePrice), 2) : '--'}</strong>
      </div>
      <div className="hud-metric">
        <span>EQUITY</span>
        <strong>{formatNumber(equity)}</strong>
        <small>Balance {formatNumber(balance)}</small>
      </div>
      <div className="hud-metric">
        <span>FLOATING P/L</span>
        <strong className={floatingPL > 0 ? 'positive' : floatingPL < 0 ? 'negative' : ''}>
          {floatingPL > 0 ? '+' : ''}{formatNumber(floatingPL)}
        </strong>
      </div>
      <div className="hud-metric hud-position-count">
        <span>POSITIONS</span>
        <strong>{positionCount}</strong>
      </div>
      <div className="hud-clock">
        <span>{mode === 'replay' ? 'HISTORICAL REPLAY' : 'FULL HISTORY'}</span>
        <strong>{timestamp}</strong>
        <small>{strategy?.name ?? '未選擇策略'}</small>
      </div>
      <div className="hud-progress" aria-label="歷史播放進度">
        <div style={{ width: `${progress * 100}%` }} />
      </div>
    </section>
  );
};
