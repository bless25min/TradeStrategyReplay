import { useState } from 'react';
import { Database, Upload, X } from 'lucide-react';
import type { BarData, LegacyTradeAction, MarketMeta, StrategyDataType, StrategyMeta, StrategyTrade, ValidationResult } from '../../types';
import { parseLegacyActionTrades } from '../../utils/legacyTradeParser';
import { parseQuotesCsv, parseTradesCsv } from '../../utils/strategyParser';
import { validateStrategyData } from '../../utils/validation';
import { useMarketStore } from '../../store/useMarketStore';
import { useStrategyStore } from '../../store/useStrategyStore';

interface Props { open: boolean; onClose: () => void; }
type ImportTab = 'market' | 'strategy';

const parseMarketFile = async (file: File, utcOffset: string): Promise<BarData[]> => {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith('.json')) {
    const bars = JSON.parse(text) as BarData[];
    return [...bars].sort((a, b) => a.time - b.time);
  }
  return parseQuotesCsv(text, utcOffset);
};

const parseTradeFile = async (file: File, utcOffset: string, symbol?: string): Promise<StrategyTrade[]> => {
  const text = await file.text();
  if (!file.name.toLowerCase().endsWith('.json')) return parseTradesCsv(text, utcOffset);

  const data = JSON.parse(text) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) throw new Error('交易 JSON 必須是陣列。');
  if (!data.length) return [];

  const sample = data[0];
  if ('entryTime' in sample && 'exitTime' in sample) {
    return (data as unknown as StrategyTrade[]).sort((a, b) => a.entryTime - b.entryTime);
  }
  if ('time' in sample && 'type' in sample) {
    return parseLegacyActionTrades(data as unknown as LegacyTradeAction[], symbol);
  }
  throw new Error('無法識別交易 JSON 格式。請使用 completed trades 或 SoyaPlayableAd action log。');
};

export const ImportDialog = ({ open, onClose }: Props) => {
  const [tab, setTab] = useState<ImportTab>('market');
  const marketMeta = useMarketStore((state) => state.meta);
  const quotes = useMarketStore((state) => state.quotes);
  const setMarket = useMarketStore((state) => state.setMarket);
  const setImportedStrategy = useStrategyStore((state) => state.setImportedStrategy);

  const [instrument, setInstrument] = useState('台指期');
  const [symbol, setSymbol] = useState('TXF');
  const [timeframe, setTimeframe] = useState('15分鐘');
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [utcOffset, setUtcOffset] = useState('+08:00');
  const [quotesFile, setQuotesFile] = useState<File | null>(null);

  const [name, setName] = useState('匯入策略');
  const [platform, setPlatform] = useState('合作券商 / 期貨商');
  const [dataType, setDataType] = useState<StrategyDataType>('backtest');
  const [tradesFile, setTradesFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const importMarket = async () => {
    setError(null);
    setValidation(null);
    if (!quotesFile) { setError('請選擇商品歷史行情報價檔。'); return; }
    try {
      const parsedQuotes = await parseMarketFile(quotesFile, utcOffset);
      if (!parsedQuotes.length) throw new Error('歷史行情報價檔沒有可用 K 棒。');
      const marketId = `import-market-${Date.now()}`;
      const meta: MarketMeta = {
        id: marketId,
        instrument,
        symbol,
        timeframe,
        timezone,
        utcOffset,
        quoteSource: `Browser import: ${quotesFile.name}`,
        contractMode: 'actual',
        quoteFormat: quotesFile.name.toLowerCase().endsWith('.json') ? 'json' : 'csv',
        quoteFiles: [],
      };
      setMarket({ meta, quotes: parsedQuotes });
      const placeholder: StrategyMeta = {
        id: `market-only-${Date.now()}`,
        name: `${instrument}｜尚未匯入策略`,
        platform: '本機資料',
        marketId,
        dataType: 'backtest',
        disclaimer: '目前僅載入商品歷史行情，尚未匯入策略交易紀錄。',
      };
      setImportedStrategy({ meta: placeholder, trades: [] });
      setTab('strategy');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '商品行情匯入失敗。');
    }
  };

  const importStrategy = async () => {
    setError(null);
    setValidation(null);
    if (!marketMeta || !quotes.length) { setError('請先匯入或載入商品歷史行情。'); return; }
    if (!tradesFile) { setError('請選擇策略交易紀錄檔。'); return; }
    try {
      const trades = await parseTradeFile(tradesFile, marketMeta.utcOffset, marketMeta.symbol);
      const result = validateStrategyData(quotes, trades);
      setValidation(result);
      if (result.errors.length) return;

      const strategyMeta: StrategyMeta = {
        id: `import-strategy-${Date.now()}`,
        name,
        platform,
        marketId: marketMeta.id,
        dataType,
        startDate: quotes[0] ? new Date(quotes[0].time * 1000).toISOString() : undefined,
        endDate: quotes[quotes.length - 1] ? new Date(quotes[quotes.length - 1].time * 1000).toISOString() : undefined,
        tradeSource: `Browser import: ${tradesFile.name}`,
      };
      setImportedStrategy({ meta: strategyMeta, trades });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '交易紀錄匯入失敗。');
    }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="import-dialog">
      <div className="dialog-heading"><div><span className="eyebrow-text">DATA IMPORT</span><h2>匯入行情 / 策略交易</h2><p>商品行情與策略交易分開管理；同一份 Market 可反覆套用不同策略。</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>

      <div className="mode-switch" role="tablist" aria-label="匯入類型">
        <button className={tab === 'market' ? 'active' : ''} onClick={() => { setTab('market'); setError(null); }}>① 商品歷史行情</button>
        <button className={tab === 'strategy' ? 'active' : ''} onClick={() => { setTab('strategy'); setError(null); }}>② 策略交易紀錄</button>
      </div>

      {tab === 'market' ? <>
        <div className="form-grid">
          <label>商品名稱<input value={instrument} onChange={(e) => setInstrument(e.target.value)} /></label>
          <label>商品代號<input value={symbol} onChange={(e) => setSymbol(e.target.value)} /></label>
          <label>週期<input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} /></label>
          <label>時區<input value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label>
          <label>UTC Offset<input value={utcOffset} onChange={(e) => setUtcOffset(e.target.value)} /></label>
        </div>
        <div className="file-grid single-file">
          <label className="file-card"><Database size={20} /><strong>商品歷史行情報價</strong><span>{quotesFile?.name ?? 'CSV / TSV / MT5 Export / JSON'}</span><input type="file" accept=".csv,.tsv,.txt,.json,text/csv,text/plain,application/json" onChange={(e) => setQuotesFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        <div className="dialog-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={importMarket}>載入商品行情 →</button></div>
      </> : <>
        <div className="validation">目前 Market：<strong>{marketMeta ? `${marketMeta.instrument} · ${marketMeta.symbol} · ${marketMeta.timeframe}` : '尚未載入'}</strong>{quotes.length > 0 && <span> · {quotes.length.toLocaleString()} 根 K 棒</span>}</div>
        <div className="form-grid">
          <label>策略名稱<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>上架平台<input value={platform} onChange={(e) => setPlatform(e.target.value)} /></label>
          <label>資料類型<select value={dataType} onChange={(e) => setDataType(e.target.value as StrategyDataType)}><option value="backtest">歷史回測模擬</option><option value="paper">擬真紀錄</option><option value="live">實盤紀錄</option></select></label>
        </div>
        <div className="file-grid single-file">
          <label className="file-card"><Upload size={20} /><strong>策略交易紀錄</strong><span>{tradesFile?.name ?? 'CSV / completed trades JSON / legacy action JSON'}</span><input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => setTradesFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        <div className="dialog-actions"><button className="secondary-button" onClick={() => setTab('market')}>← 商品行情</button><button className="primary-button" onClick={importStrategy}>驗證並載入策略</button></div>
      </>}

      {error && <div className="validation error-box">{error}</div>}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && <div className="validation">
        {validation.errors.map((issue, index) => <div className="validation-error" key={`e-${index}`}>錯誤：{issue.message}</div>)}
        {validation.warnings.slice(0, 8).map((issue, index) => <div className="validation-warning" key={`w-${index}`}>提醒：{issue.message}</div>)}
        {validation.warnings.length > 8 && <div>另有 {validation.warnings.length - 8} 項提醒。</div>}
      </div>}
    </div>
  </div>;
};
