import { useEffect } from 'react';
import { useMarketStore } from '../store/useMarketStore';
import { useTradingStore } from '../store/useTradingStore';

export const useTradingMarkToMarket = (): void => {
  const livePrice = useMarketStore((state) => state.livePrice);

  useEffect(() => {
    if (Number.isFinite(livePrice)) useTradingStore.getState().markToMarket(Number(livePrice));
  }, [livePrice]);
};
