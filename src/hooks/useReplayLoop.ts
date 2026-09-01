import { useEffect, useRef } from 'react';
import { useMarketStore } from '../store/useMarketStore';
import { interpolateReplayBar } from '../utils/replayFrame';

const BASE_MS_PER_BAR = 1200;

export const useReplayLoop = (): void => {
  const mode = useMarketStore((state) => state.mode);
  const isPlaying = useMarketStore((state) => state.isPlaying);
  const lastFrame = useRef<number | null>(null);

  useEffect(() => {
    if (mode !== 'replay' || !isPlaying) {
      lastFrame.current = null;
      return undefined;
    }

    let frameId = 0;
    const loop = (now: number) => {
      const store = useMarketStore.getState();
      if (!store.isPlaying || store.mode !== 'replay') return;
      if (!store.quotes.length) {
        store.setPlaying(false);
        return;
      }

      if (lastFrame.current == null) lastFrame.current = now;
      const delta = Math.min(100, now - lastFrame.current);
      lastFrame.current = now;

      let index = store.currentIndex;
      let progress = store.barProgress + (delta / BASE_MS_PER_BAR) * store.speed;

      while (progress >= 1 && index < store.quotes.length - 1) {
        progress -= 1;
        index += 1;
      }

      if (index >= store.quotes.length - 1 && progress >= 1) {
        const finalBar = store.quotes[store.quotes.length - 1];
        store.setReplayFrame(store.quotes.length - 1, 1, finalBar.close);
        store.setPlaying(false);
        return;
      }

      const activeBar = store.quotes[index];
      const frame = interpolateReplayBar(activeBar, progress);
      store.setReplayFrame(index, progress, frame.price);
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [mode, isPlaying]);
};
