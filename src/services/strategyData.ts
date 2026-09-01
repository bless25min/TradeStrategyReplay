import type { StrategyIndexItem, StrategyMeta, StrategyTrade } from '../types';
import { parseTradesCsv } from '../utils/strategyParser';

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`讀取策略資料失敗：${url} (${response.status})`);
  return response.text();
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

export const loadStrategyTrades = async (strategyId: string, utcOffset: string): Promise<StrategyTrade[]> => {
  const base = `/strategies/${strategyId}`;
  const jsonResponse = await fetch(`${base}/trades.json`);
  if (jsonResponse.ok) {
    const trades = (await jsonResponse.json()) as StrategyTrade[];
    return [...trades].sort((a, b) => a.entryTime - b.entryTime);
  }
  return parseTradesCsv(await fetchText(`${base}/trades.csv`), utcOffset);
};
