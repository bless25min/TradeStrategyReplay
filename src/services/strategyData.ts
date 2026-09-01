import type { LegacyTradeAction, StrategyIndexItem, StrategyMeta, StrategyTrade } from '../types';
import { parseLegacyActionTrades } from '../utils/legacyTradeParser';
import { parseTradesCsv } from '../utils/strategyParser';

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`讀取策略資料失敗：${url} (${response.status})`);
  return response.text();
};

const resolveDataUrl = (base: string, file: string): string => {
  if (/^https?:\/\//i.test(file) || file.startsWith('/')) return file;
  return `${base}/${file}`;
};

export const loadStrategyCatalog = async (): Promise<StrategyIndexItem[]> => {
  const response = await fetch('/strategies/index.json');
  if (!response.ok) throw new Error('無法讀取策略清單。');
  return response.json() as Promise<StrategyIndexItem[]>;
};

export const loadStrategyMeta = async (strategyId: string): Promise<StrategyMeta> => {
  const response = await fetch(`/strategies/${strategyId}/meta.json`);
  if (!response.ok) throw new Error(`無法讀取策略 ${strategyId} 的 meta.json。`);
  return response.json() as Promise<StrategyMeta>;
};

export const loadStrategyTrades = async (
  strategyId: string,
  utcOffset: string,
  meta?: StrategyMeta,
): Promise<StrategyTrade[]> => {
  const base = `/strategies/${strategyId}`;

  if (meta?.tradeFormat === 'legacy-actions' && meta.tradeFiles?.length) {
    const chunks = await Promise.all(meta.tradeFiles.map(async (file) => {
      const response = await fetch(resolveDataUrl(base, file));
      if (!response.ok) throw new Error(`讀取舊版交易紀錄失敗：${file} (${response.status})`);
      return (await response.json()) as LegacyTradeAction[];
    }));
    return parseLegacyActionTrades(chunks.flat(), meta.legacySymbol);
  }

  if (meta?.tradeFiles?.length) {
    const chunks = await Promise.all(meta.tradeFiles.map(async (file) => {
      const url = resolveDataUrl(base, file);
      if (meta.tradeFormat === 'json' || file.endsWith('.json')) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`讀取策略資料失敗：${url} (${response.status})`);
        return (await response.json()) as StrategyTrade[];
      }
      return parseTradesCsv(await fetchText(url), utcOffset);
    }));
    return chunks.flat().sort((a, b) => a.entryTime - b.entryTime);
  }

  const jsonResponse = await fetch(`${base}/trades.json`);
  if (jsonResponse.ok) {
    const trades = (await jsonResponse.json()) as StrategyTrade[];
    return [...trades].sort((a, b) => a.entryTime - b.entryTime);
  }
  return parseTradesCsv(await fetchText(`${base}/trades.csv`), utcOffset);
};
