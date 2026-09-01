import type { StrategyBundle, StrategyIndexItem, StrategyMeta } from '../types';
import { parseQuotesCsv, parseTradesCsv } from '../utils/strategyParser';

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`讀取資料失敗：${url} (${response.status})`);
  return response.text();
};

export const loadStrategyCatalog = async (): Promise<StrategyIndexItem[]> => {
  const response = await fetch('/strategies/index.json');
  if (!response.ok) throw new Error('無法讀取策略清單。');
  return response.json() as Promise<StrategyIndexItem[]>;
};

export const loadStrategyBundle = async (strategyId: string): Promise<StrategyBundle> => {
  const base = `/strategies/${strategyId}`;
  const metaResponse = await fetch(`${base}/meta.json`);
  if (!metaResponse.ok) throw new Error(`無法讀取策略 ${strategyId} 的 meta.json。`);
  const meta = (await metaResponse.json()) as StrategyMeta;

  const [quotesText, tradesText] = await Promise.all([
    fetchText(`${base}/quotes.csv`),
    fetchText(`${base}/trades.csv`),
  ]);

  return {
    meta,
    quotes: parseQuotesCsv(quotesText, meta.utcOffset),
    trades: parseTradesCsv(tradesText, meta.utcOffset),
  };
};
