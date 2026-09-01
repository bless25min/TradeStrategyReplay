import { useEffect } from 'react';
import { useMarketStore } from '../store/useMarketStore';
import { useTradingStore } from '../store/useTradingStore';

export const useTradingMarkToMarket = (): void => {
  const currentIndex = useMarketStore((state) => state.currentIndex);
  const quotes = useMarketStore((state) => state.quotes);

  useEffect(() => {
    const price = quotes[currentIndex]?.close;
    if (Number.isFinite(price)) useTradingStore.getState().markToMarket(price);
  }, [quotes, currentIndex]);
};
