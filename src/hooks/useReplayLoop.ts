import { useEffect, useRef } from 'react';
import { useStrategyStore } from '../store/useStrategyStore';

const BASE_MS_PER_BAR = 500;

export const useReplayLoop = (): void => {
  const mode = useStrategyStore((state) => state.mode);
  const isPlaying = useStrategyStore((state) => state.isPlaying);
  const lastFrame = useRef<number | null>(null);
  const accumulator = useRef(0);

  useEffect(() => {
    if (mode !== 'replay' || !isPlaying) {
      lastFrame.current = null;
      accumulator.current = 0;
      return undefined;
    }

    let frameId = 0;
    const loop = (now: number) => {
      const store = useStrategyStore.getState();
      if (!store.isPlaying || store.mode !== 'replay') return;

      if (lastFrame.current == null) lastFrame.current = now;
      const delta = now - lastFrame.current;
      lastFrame.current = now;
      accumulator.current += (delta * store.speed) / BASE_MS_PER_BAR;

      const steps = Math.floor(accumulator.current);
      if (steps >= 1) {
        accumulator.current -= steps;
        const nextIndex = Math.min(store.currentIndex + steps, store.quotes.length - 1);
        store.setCurrentIndex(nextIndex);
        if (nextIndex >= store.quotes.length - 1) store.setPlaying(false);
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [mode, isPlaying]);
};
