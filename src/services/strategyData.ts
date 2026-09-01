import type { LegacyTradeAction, StrategyIndexItem, StrategyMeta, StrategyTrade } from '../types';
import { fetchDataJson, fetchDataText } from '../utils/fetchData';
import { parseLegacyActionTrades } from '../utils/legacyTradeParser';
import { parseTradesCsv } from '../utils/strategyParser';

const resolveDataUrl = (base: string, file: string): string => {
  if (/^https?:\/\//i.test(file) || file.startsWith('/')) return file;
  return `${base}/${file}`;
};

export const loadStrategyCatalog = async (): Promise<StrategyIndexItem[]> =>
  fetchDataJson<StrategyIndexItem[]>('/strategies/index.json', '策略清單');

export const loadStrategyMeta = async (strategyId: string): Promise<StrategyMeta> =>
  fetchDataJson<StrategyMeta>(`/strategies/${strategyId}/meta.json`, `策略 ${strategyId} metadata`);

export const loadStrategyTrades = async (
  strategyId: string,
  utcOffset: string,
  meta: StrategyMeta,
): Promise<StrategyTrade[]> => {
  const base = `/strategies/${strategyId}`;
  const files = meta.tradeFiles?.length ? meta.tradeFiles : ['trades.csv'];
  const format = meta.tradeFormat ?? 'csv';

  if (format === 'legacy-actions') {
    const chunks = await Promise.all(files.map((file) =>
      fetchDataJson<LegacyTradeAction[]>(resolveDataUrl(base, file), `策略 ${strategyId} 舊版交易紀錄`)
    ));
    const trades = parseLegacyActionTrades(chunks.flat(), meta.legacySymbol);
    if (!trades.length) throw new Error(`策略 ${strategyId} 沒有可用的舊版交易紀錄。`);
    return trades;
  }

  if (format === 'json') {
    const chunks = await Promise.all(files.map((file) =>
      fetchDataJson<StrategyTrade[]>(resolveDataUrl(base, file), `策略 ${strategyId} 交易紀錄`)
    ));
    const trades = chunks.flat().sort((a, b) => a.entryTime - b.entryTime);
    if (!trades.length) throw new Error(`策略 ${strategyId} 沒有可用的交易紀錄。`);
    return trades;
  }

  const chunks = await Promise.all(files.map(async (file) =>
    parseTradesCsv(await fetchDataText(resolveDataUrl(base, file), `策略 ${strategyId} 交易紀錄`), utcOffset)
  ));
  const trades = chunks.flat().sort((a, b) => a.entryTime - b.entryTime);
  if (!trades.length) throw new Error(`策略 ${strategyId} 沒有可用的交易紀錄。`);
  return trades;
};
