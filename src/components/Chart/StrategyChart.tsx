import { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useMarketStore } from '../../store/useMarketStore';
import { useStrategyStore } from '../../store/useStrategyStore';
import { useTradingStore } from '../../store/useTradingStore';
import { findContainingBar } from '../../utils/barLookup';
import { interpolateReplayBar, replayTimestamp } from '../../utils/replayFrame';

interface MarkerPluginRef {
  setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void;
}

interface BarMarkerInput {
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text?: string;
  size?: number;
  id?: string;
}

export const StrategyChart = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markerPluginRef = useRef<MarkerPluginRef | null>(null);

  const quotes = useMarketStore((state) => state.quotes);
  const mode = useMarketStore((state) => state.mode);
  const currentIndex = useMarketStore((state) => state.currentIndex);
  const barProgress = useMarketStore((state) => state.barProgress);
  const strategyTrades = useStrategyStore((state) => state.trades);
  const selectedTradeId = useStrategyStore((state) => state.selectedTradeId);
  const manualOpen = useTradingStore((state) => state.openPositions);
  const manualHistory = useTradingStore((state) => state.history);

  const currentTime = useMemo(() => {
    if (!quotes.length) return 0;
    if (mode === 'overview') return quotes[quotes.length - 1].time;
    return replayTimestamp(quotes, currentIndex, barProgress);
  }, [quotes, mode, currentIndex, barProgress]);

  const markers = useMemo(() => {
    const result: SeriesMarker<UTCTimestamp>[] = [];
    const pushMarker = (time: number, marker: BarMarkerInput) => {
      const bar = findContainingBar(quotes, time);
      if (bar) result.push({ ...marker, time: bar.time as UTCTimestamp } as SeriesMarker<UTCTimestamp>);
    };

    strategyTrades.forEach((trade) => {
      if (mode === 'overview' || trade.entryTime <= currentTime) {
        pushMarker(trade.entryTime, {
          position: trade.side === 'LONG' ? 'belowBar' : 'aboveBar',
          color: trade.side === 'LONG' ? '#1677ff' : '#e5484d',
          shape: trade.side === 'LONG' ? 'arrowUp' : 'arrowDown',
          text: trade.side === 'LONG' ? '策略多' : '策略空',
          size: 1.35,
        });
      }
      if (mode === 'overview' || trade.exitTime <= currentTime) {
        pushMarker(trade.exitTime, {
          position: trade.side === 'LONG' ? 'aboveBar' : 'belowBar',
          color: trade.pnlPoints >= 0 ? '#1f9d61' : '#f59e0b',
          shape: 'square',
          text: `${trade.pnlPoints >= 0 ? '+' : ''}${trade.pnlPoints.toFixed(1)}`,
          size: 1.05,
        });
      }
    });

    [...manualHistory, ...manualOpen].forEach((trade) => {
      if (mode === 'overview' || trade.entryTime <= currentTime) {
        pushMarker(trade.entryTime, {
          position: trade.side === 'LONG' ? 'belowBar' : 'aboveBar',
          color: '#7c3aed',
          shape: 'circle',
          text: trade.side === 'LONG' ? '我的多' : '我的空',
          size: 1.15,
        });
      }
      if (trade.status === 'CLOSED' && trade.closeTime && (mode === 'overview' || trade.closeTime <= currentTime)) {
        pushMarker(trade.closeTime, {
          position: trade.side === 'LONG' ? 'aboveBar' : 'belowBar',
          color: '#7c3aed',
          shape: 'square',
          text: `平 ${(trade.pnl ?? 0) >= 0 ? '+' : ''}${(trade.pnl ?? 0).toFixed(0)}`,
          size: 1,
        });
      }
    });

    return result.sort((a, b) => Number(a.time) - Number(b.time));
  }, [quotes, strategyTrades, manualHistory, manualOpen, currentTime, mode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#697386',
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#f1f3f5' }, horzLines: { color: '#f1f3f5' } },
      rightPriceScale: { borderColor: '#e2e6ea', scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: {
        borderColor: '#e2e6ea',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 7,
        minBarSpacing: 3,
      },
      crosshair: { vertLine: { color: '#9aa5b1' }, horzLine: { color: '#9aa5b1' } },
      handleScale: true,
      handleScroll: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      borderVisible: false,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const markerPlugin = createSeriesMarkers(series, []);
    chartRef.current = chart;
    seriesRef.current = series;
    markerPluginRef.current = markerPlugin as MarkerPluginRef;

    const resize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !quotes.length) return;

    if (mode === 'overview') {
      seriesRef.current.setData(quotes.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })));
      chartRef.current?.timeScale().fitContent();
      return;
    }

    const completed = quotes.slice(0, currentIndex);
    const active = interpolateReplayBar(quotes[currentIndex], barProgress).bar;
    seriesRef.current.setData([
      ...completed.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })),
      { ...active, time: active.time as UTCTimestamp },
    ]);
    chartRef.current?.timeScale().scrollToPosition(6, false);
  }, [quotes, mode, currentIndex]);

  useEffect(() => {
    if (!seriesRef.current || mode !== 'replay' || !quotes[currentIndex]) return;
    const active = interpolateReplayBar(quotes[currentIndex], barProgress).bar;
    seriesRef.current.update({ ...active, time: active.time as UTCTimestamp });
  }, [quotes, mode, currentIndex, barProgress]);

  useEffect(() => {
    markerPluginRef.current?.setMarkers(markers);
  }, [markers]);

  useEffect(() => {
    if (!chartRef.current || !quotes.length || mode !== 'overview') return;
    if (!selectedTradeId) return;
    const trade = strategyTrades.find((item) => item.tradeId === selectedTradeId);
    if (!trade) return;
    const duration = Math.max(3600, trade.exitTime - trade.entryTime);
    const padding = duration * 0.75;
    chartRef.current.timeScale().setVisibleRange({
      from: Math.max(quotes[0].time, trade.entryTime - padding) as UTCTimestamp,
      to: Math.min(quotes[quotes.length - 1].time, trade.exitTime + padding) as UTCTimestamp,
    });
  }, [selectedTradeId, strategyTrades, quotes, mode]);

  return (
    <div className="chart-shell">
      <div ref={containerRef} className="chart-container" />
      <div className="chart-legend">
        <span><i className="legend-strategy" />策略交易</span>
        <span><i className="legend-player" />我的交易</span>
      </div>
    </div>
  );
};
