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

interface MarkerPluginRef {
  setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void;
}

export const StrategyChart = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markerPluginRef = useRef<MarkerPluginRef | null>(null);

  const quotes = useMarketStore((state) => state.quotes);
  const mode = useMarketStore((state) => state.mode);
  const currentIndex = useMarketStore((state) => state.currentIndex);
  const strategyTrades = useStrategyStore((state) => state.trades);
  const selectedTradeId = useStrategyStore((state) => state.selectedTradeId);
  const manualOpen = useTradingStore((state) => state.openPositions);
  const manualHistory = useTradingStore((state) => state.history);

  const visibleQuotes = useMemo(
    () => mode === 'overview' ? quotes : quotes.slice(0, currentIndex + 1),
    [quotes, mode, currentIndex],
  );
  const currentTime = visibleQuotes[visibleQuotes.length - 1]?.time ?? 0;

  const markers = useMemo(() => {
    const result: SeriesMarker<UTCTimestamp>[] = [];
    const pushStrategyMarker = (
      time: number,
      marker: Omit<SeriesMarker<UTCTimestamp>, 'time'>,
    ) => {
      const bar = findContainingBar(quotes, time);
      if (bar) result.push({ ...marker, time: bar.time as UTCTimestamp });
    };

    strategyTrades.forEach((trade) => {
      if (mode === 'overview' || trade.entryTime <= currentTime) {
        pushStrategyMarker(trade.entryTime, {
          position: trade.side === 'LONG' ? 'belowBar' : 'aboveBar',
          color: trade.side === 'LONG' ? '#2563eb' : '#e11d48',
          shape: trade.side === 'LONG' ? 'arrowUp' : 'arrowDown',
          text: `${trade.side === 'LONG' ? '策略多進' : '策略空進'} ${trade.entryPrice}`,
          size: 1.4,
        });
      }
      if (mode === 'overview' || trade.exitTime <= currentTime) {
        pushStrategyMarker(trade.exitTime, {
          position: trade.side === 'LONG' ? 'aboveBar' : 'belowBar',
          color: trade.pnlPoints >= 0 ? '#059669' : '#d97706',
          shape: 'square',
          text: `策略出 ${trade.pnlPoints >= 0 ? '+' : ''}${trade.pnlPoints.toFixed(0)}`,
          size: 1.1,
        });
      }
    });

    [...manualHistory, ...manualOpen].forEach((trade) => {
      if (mode === 'overview' || trade.entryTime <= currentTime) {
        result.push({
          time: trade.entryTime as UTCTimestamp,
          position: trade.side === 'LONG' ? 'belowBar' : 'aboveBar',
          color: '#7c3aed',
          shape: 'circle',
          text: `我的${trade.side === 'LONG' ? '多' : '空'} ${trade.entryPrice}`,
          size: 1.2,
        });
      }
      if (trade.status === 'CLOSED' && trade.closeTime && (mode === 'overview' || trade.closeTime <= currentTime)) {
        result.push({
          time: trade.closeTime as UTCTimestamp,
          position: trade.side === 'LONG' ? 'aboveBar' : 'belowBar',
          color: '#7c3aed',
          shape: 'square',
          text: `我的出 ${(trade.pnl ?? 0) >= 0 ? '+' : ''}${(trade.pnl ?? 0).toFixed(0)}`,
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
      layout: { background: { type: ColorType.Solid, color: '#0b1220' }, textColor: '#94a3b8', attributionLogo: true },
      grid: { vertLines: { color: '#162033' }, horzLines: { color: '#162033' } },
      rightPriceScale: { borderColor: '#26344a' },
      timeScale: { borderColor: '#26344a', timeVisible: true, secondsVisible: false, rightOffset: 8 },
      crosshair: { vertLine: { color: '#475569' }, horzLine: { color: '#475569' } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444', borderVisible: false,
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
    if (!seriesRef.current || !markerPluginRef.current) return;
    seriesRef.current.setData(visibleQuotes.map((bar) => ({ ...bar, time: bar.time as UTCTimestamp })));
    markerPluginRef.current.setMarkers(markers);
    if (mode === 'replay' && visibleQuotes.length) chartRef.current?.timeScale().scrollToRealTime();
  }, [visibleQuotes, markers, mode]);

  useEffect(() => {
    if (!chartRef.current || !quotes.length) return;
    if (!selectedTradeId) {
      if (mode === 'overview') chartRef.current.timeScale().fitContent();
      return;
    }
    const trade = strategyTrades.find((item) => item.tradeId === selectedTradeId);
    if (!trade) return;
    const duration = Math.max(3600, trade.exitTime - trade.entryTime);
    const padding = duration * 0.75;
    chartRef.current.timeScale().setVisibleRange({
      from: Math.max(quotes[0].time, trade.entryTime - padding) as UTCTimestamp,
      to: Math.min(quotes[quotes.length - 1].time, trade.exitTime + padding) as UTCTimestamp,
    });
  }, [selectedTradeId, strategyTrades, quotes, mode]);

  return <div className="chart-shell"><div ref={containerRef} className="chart-container" /><div className="chart-legend"><span><i className="strategy-long" />策略進出</span><span><i className="manual" />我的模擬交易</span></div></div>;
};
