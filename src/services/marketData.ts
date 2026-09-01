import type { BarData, MarketBundle, MarketIndexItem, MarketMeta } from '../types';
import { fetchDataJson, fetchDataText } from '../utils/fetchData';
import { parseQuotesCsv } from '../utils/strategyParser';

const normalizeBars = (bars: BarData[]): BarData[] => {
  const deduped = new Map<number, BarData>();
  bars.forEach((bar) => deduped.set(bar.time, bar));
  return [...deduped.values()].sort((a, b) => a.time - b.time);
};

const resolveDataUrl = (base: string, file: string): string => {
  if (/^https?:\/\//i.test(file) || file.startsWith('/')) return file;
  return `${base}/${file}`;
};

export const loadMarketCatalog = async (): Promise<MarketIndexItem[]> =>
  fetchDataJson<MarketIndexItem[]>('/markets/index.json', '市場清單');

export const loadMarketBundle = async (marketId: string): Promise<MarketBundle> => {
  const base = `/markets/${marketId}`;
  const meta = await fetchDataJson<MarketMeta>(`${base}/meta.json`, `市場 ${marketId} metadata`);

  const chunks = await Promise.all(meta.quoteFiles.map(async (file) => {
    const url = resolveDataUrl(base, file);
    if ((meta.quoteFormat ?? (file.endsWith('.json') ? 'json' : 'csv')) === 'json') {
      return fetchDataJson<BarData[]>(url, `市場 ${marketId} 行情`);
    }
    return parseQuotesCsv(await fetchDataText(url, `市場 ${marketId} 行情`), meta.utcOffset);
  }));

  const quotes = normalizeBars(chunks.flat());
  if (!quotes.length) throw new Error(`市場 ${marketId} 沒有可用的歷史行情。`);
  return { meta, quotes };
};
