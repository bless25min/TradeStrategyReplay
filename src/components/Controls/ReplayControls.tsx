import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useMarketStore } from '../../store/useMarketStore';
import { useStrategyStore } from '../../store/useStrategyStore';
import { useTradingStore } from '../../store/useTradingStore';
import { formatTimestamp } from '../../utils/time';

const SPEEDS = [1, 5, 20, 100];

export const ReplayControls = () => {
  const mode = useMarketStore((state) => state.mode);
  const currentIndex = useMarketStore((state) => state.currentIndex);
  const quotes = useMarketStore((state) => state.quotes);
  const isPlaying = useMarketStore((state) => state.isPlaying);
  const speed = useMarketStore((state) => state.speed);
  const marketMeta = useMarketStore((state) => state.meta);
  const setMode = useMarketStore((state) => state.setMode);
  const setPlaying = useMarketStore((state) => state.setPlaying);
  const setSpeed = useMarketStore((state) => state.setSpeed);
  const setCurrentIndex = useMarketStore((state) => state.setCurrentIndex);
  const jumpToTrade = useStrategyStore((state) => state.jumpToTrade);
  const resetTrading = useTradingStore((state) => state.reset);
  const currentTime = quotes[currentIndex]?.time;

  const changeMode = (nextMode: 'overview' | 'replay') => {
    setMode(nextMode);
    resetTrading();
  };

  return <div className="replay-controls">
    <div className="mode-switch" role="tablist" aria-label="觀看模式">
      <button className={mode === 'overview' ? 'active' : ''} onClick={() => changeMode('overview')}>全覽</button>
      <button className={mode === 'replay' ? 'active' : ''} onClick={() => changeMode('replay')}>歷史重播</button>
    </div>
    {mode === 'replay' && <>
      <div className="playback-buttons">
        <button className="icon-button" onClick={() => jumpToTrade(-1)} title="上一筆交易"><ChevronLeft size={18} /></button>
        <button className="play-button" onClick={() => setPlaying(!isPlaying)}>{isPlaying ? <Pause size={19} /> : <Play size={19} />}{isPlaying ? '暫停' : '播放'}</button>
        <button className="icon-button" onClick={() => jumpToTrade(1)} title="下一筆交易"><ChevronRight size={18} /></button>
      </div>
      <div className="speed-buttons">{SPEEDS.map((item) => <button key={item} className={speed === item ? 'active' : ''} onClick={() => setSpeed(item)}>{item}x</button>)}</div>
      <div className="timeline-wrap">
        <input aria-label="歷史播放進度" type="range" min={0} max={Math.max(0, quotes.length - 1)} value={currentIndex} onChange={(event) => setCurrentIndex(Number(event.target.value))} />
        <span>{currentTime && marketMeta ? formatTimestamp(currentTime, marketMeta.timezone) : '--'}</span>
      </div>
    </>}
  </div>;
};
