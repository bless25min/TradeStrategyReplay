import type { BarData, MarketBundle, MarketIndexItem, MarketMeta } from '../types';
import { parseQuotesCsv } from '../utils/strategyParser';

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`讀取市場資料失敗：${url} (${response.status})`);
  return response.text();
};

const normalizeBars = (bars: BarData[]): BarData[] => {
  const deduped = new Map<number, BarData>();
  bars.forEach((bar) => deduped.set(bar.time, bar));
  return [...deduped.values()].sort((a, b) => a.time - b.time);
};

export const loadMarketCatalog = async (): Promise<MarketIndexItem[]> => {
  const response = await fetch('/markets/index.json');
  if (!response.ok) throw new Error('無法讀取市場清單。');
  return response.json() as Promise<MarketIndexItem[]>;
};

export const loadMarketBundle = async (marketId: string): Promise<MarketBundle> => {
  const base = `/markets/${marketId}`;
  const metaResponse = await fetch(`${base}/meta.json`);
  if (!metaResponse.ok) throw new Error(`無法讀取市場 ${marketId} 的 meta.json。`);
  const meta = (await metaResponse.json()) as MarketMeta;

  const chunks = await Promise.all(meta.quoteFiles.map(async (file) => {
    const url = file.startsWith('/') ? file : `${base}/${file}`;
    if ((meta.quoteFormat ?? (file.endsWith('.json') ? 'json' : 'csv')) === 'json') {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`讀取市場資料失敗：${url} (${response.status})`);
      return (await response.json()) as BarData[];
    }
    return parseQuotesCsv(await fetchText(url), meta.utcOffset);
  }));

  return { meta, quotes: normalizeBars(chunks.flat()) };
};
