import { create } from 'zustand';
import type { ImportedReplayBundle, StrategyDefinition, StrategyIndexItem, StrategyMeta, StrategyTrade } from '../types';
import { loadMarketBundle } from '../services/marketData';
import { loadStrategyCatalog, loadStrategyMeta, loadStrategyTrades } from '../services/strategyData';
import { findContainingBarIndex } from '../utils/barLookup';
import { useMarketStore } from './useMarketStore';
import { useTradingStore } from './useTradingStore';

interface StrategyState {
  catalog: StrategyIndexItem[];
  selectedStrategyId: string | null;
  meta: StrategyMeta | null;
  trades: StrategyTrade[];
  selectedTradeId: string | null;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  loadStrategy: (strategyId: string) => Promise<void>;
  setImportedBundle: (bundle: ImportedReplayBundle) => void;
  setImportedStrategy: (strategy: StrategyDefinition) => void;
  selectTrade: (tradeId: string | null) => void;
  jumpToTrade: (direction: -1 | 1) => void;
}

const tradingConfigFromMeta = (meta: StrategyMeta) => ({
  initialBalance: meta.initialBalance ?? 10_000,
  contractSize: meta.contractSize ?? 100,
  leverage: meta.leverage ?? 500,
});

const filterTradesToMarket = (trades: StrategyTrade[]): StrategyTrade[] => {
  const quotes = useMarketStore.getState().quotes;
  if (!quotes.length) return trades;
  const first = quotes[0].time;
  const last = quotes[quotes.length - 1].time;
  return trades.filter((trade) => trade.entryTime >= first && trade.exitTime <= last);
};

export const useStrategyStore = create<StrategyState>((set, get) => ({
  catalog: [],
  selectedStrategyId: null,
  meta: null,
  trades: [],
  selectedTradeId: null,
  loading: true,
  error: null,

  initialize: async () => {
    set({ loading: true, error: null });
    try {
      const catalog = await loadStrategyCatalog();
      set({ catalog });
      if (catalog.length) await get().loadStrategy(catalog[0].id);
      else set({ loading: false, error: '策略清單目前是空的。' });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '初始化失敗' });
    }
  },

  loadStrategy: async (strategyId) => {
    set({ loading: true, error: null, selectedTradeId: null });
    useMarketStore.getState().setPlaying(false);
    try {
      const meta = await loadStrategyMeta(strategyId);
      const market = await loadMarketBundle(meta.marketId);
      useMarketStore.getState().setMarket(market);
      const loadedTrades = await loadStrategyTrades(strategyId, market.meta.utcOffset, meta);
      const trades = filterTradesToMarket(loadedTrades);
      useTradingStore.getState().configureAndReset(tradingConfigFromMeta(meta));
      set({ selectedStrategyId: strategyId, meta, trades, selectedTradeId: null, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : '策略載入失敗' });
    }
  },

  setImportedBundle: ({ market, strategy }) => {
    useMarketStore.getState().setMarket(market);
    useTradingStore.getState().configureAndReset(tradingConfigFromMeta(strategy.meta));
    set({
      selectedStrategyId: strategy.meta.id,
      meta: strategy.meta,
      trades: strategy.trades,
      selectedTradeId: null,
      loading: false,
      error: null,
    });
  },

  setImportedStrategy: (strategy) => {
    useTradingStore.getState().configureAndReset(tradingConfigFromMeta(strategy.meta));
    set({
      selectedStrategyId: strategy.meta.id,
      meta: strategy.meta,
      trades: strategy.trades,
      selectedTradeId: null,
      loading: false,
      error: null,
    });
  },

  selectTrade: (selectedTradeId) => {
    useMarketStore.getState().setPlaying(false);
    set({ selectedTradeId });
  },

  jumpToTrade: (direction) => {
    const { trades } = get();
    const market = useMarketStore.getState();
    if (!trades.length || !market.quotes.length) return;
    const currentTime = market.quotes[market.currentIndex]?.time ?? market.quotes[0].time;
    let trade: StrategyTrade | undefined;
    if (direction > 0) trade = trades.find((item) => item.entryTime > currentTime);
    else trade = [...trades].reverse().find((item) => item.entryTime < currentTime);
    if (!trade) trade = direction > 0 ? trades[0] : trades[trades.length - 1];
    const index = findContainingBarIndex(market.quotes, trade.entryTime);
    if (index >= 0) market.setCurrentIndex(index);
    market.setPlaying(false);
    set({ selectedTradeId: trade.tradeId });
  },
}));
