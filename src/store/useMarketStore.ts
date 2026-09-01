import { create } from 'zustand';
import type { BarData, MarketBundle, MarketMeta, ReplayMode } from '../types';

interface MarketState {
  meta: MarketMeta | null;
  quotes: BarData[];
  mode: ReplayMode;
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  setMarket: (bundle: MarketBundle) => void;
  setMode: (mode: ReplayMode) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentIndex: (index: number) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  meta: null,
  quotes: [],
  mode: 'overview',
  currentIndex: 0,
  isPlaying: false,
  speed: 5,

  setMarket: ({ meta, quotes }) => set({
    meta,
    quotes,
    mode: 'overview',
    currentIndex: Math.max(0, quotes.length - 1),
    isPlaying: false,
  }),

  setMode: (mode) => set((state) => ({
    mode,
    isPlaying: false,
    currentIndex: mode === 'overview' ? Math.max(0, state.quotes.length - 1) : 0,
  })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setSpeed: (speed) => set({ speed }),
  setCurrentIndex: (requestedIndex) => set((state) => ({
    currentIndex: Math.min(Math.max(0, requestedIndex), Math.max(0, state.quotes.length - 1)),
  })),
}));
