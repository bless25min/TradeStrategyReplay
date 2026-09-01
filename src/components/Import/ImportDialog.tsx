import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { StrategyDataType, StrategyMeta, ValidationResult } from '../../types';
import { parseQuotesCsv, parseTradesCsv } from '../../utils/strategyParser';
import { validateStrategyData } from '../../utils/validation';
import { useStrategyStore } from '../../store/useStrategyStore';

interface Props { open: boolean; onClose: () => void; }

export const ImportDialog = ({ open, onClose }: Props) => {
  const setBundle = useStrategyStore((state) => state.setBundle);
  const [name, setName] = useState('匯入策略');
  const [platform, setPlatform] = useState('合作券商 / 期貨商');
  const [instrument, setInstrument] = useState('台指期');
  const [symbol, setSymbol] = useState('TXF');
  const [timeframe, setTimeframe] = useState('15分鐘');
  const [dataType, setDataType] = useState<StrategyDataType>('backtest');
  const [quotesFile, setQuotesFile] = useState<File | null>(null);
  const [tradesFile, setTradesFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const importData = async () => {
    setError(null);
    setValidation(null);
    if (!quotesFile || !tradesFile) { setError('請同時選擇歷史報價 CSV 與交易紀錄 CSV。'); return; }
    try {
      const [quotesText, tradesText] = await Promise.all([quotesFile.text(), tradesFile.text()]);
      const utcOffset = '+08:00';
      const quotes = parseQuotesCsv(quotesText, utcOffset);
      const trades = parseTradesCsv(tradesText, utcOffset);
      const result = validateStrategyData(quotes, trades);
      setValidation(result);
      if (result.errors.length) return;

      const id = `import-${Date.now()}`;
      const meta: StrategyMeta = {
        id, name, platform, instrument, symbol, timeframe, dataType,
        timezone: 'Asia/Taipei', utcOffset,
        startDate: quotes[0] ? new Date(quotes[0].time * 1000).toISOString() : undefined,
        endDate: quotes.at(-1) ? new Date(quotes.at(-1)!.time * 1000).toISOString() : undefined,
        dataSource: 'Browser imported CSV',
      };
      setBundle({ meta, quotes, trades });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '資料匯入失敗。');
    }
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="import-dialog">
      <div className="dialog-heading"><div><span className="eyebrow-text">LOCAL IMPORT</span><h2>匯入策略資料</h2><p>資料只在目前瀏覽器中解析，不會自動上傳。</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
      <div className="form-grid">
        <label>策略名稱<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>上架平台<input value={platform} onChange={(e) => setPlatform(e.target.value)} /></label>
        <label>商品名稱<input value={instrument} onChange={(e) => setInstrument(e.target.value)} /></label>
        <label>商品代號<input value={symbol} onChange={(e) => setSymbol(e.target.value)} /></label>
        <label>週期<input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} /></label>
        <label>資料類型<select value={dataType} onChange={(e) => setDataType(e.target.value as StrategyDataType)}><option value="backtest">歷史回測模擬</option><option value="paper">擬真紀錄</option><option value="live">實盤紀錄</option></select></label>
      </div>
      <div className="file-grid">
        <label className="file-card"><Upload size={20} /><strong>歷史報價 quotes.csv</strong><span>{quotesFile?.name ?? '選擇 OHLC CSV'}</span><input type="file" accept=".csv,text/csv" onChange={(e) => setQuotesFile(e.target.files?.[0] ?? null)} /></label>
        <label className="file-card"><Upload size={20} /><strong>交易紀錄 trades.csv</strong><span>{tradesFile?.name ?? '選擇策略交易 CSV'}</span><input type="file" accept=".csv,text/csv" onChange={(e) => setTradesFile(e.target.files?.[0] ?? null)} /></label>
      </div>
      {error && <div className="validation error-box">{error}</div>}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && <div className="validation">
        {validation.errors.map((issue, index) => <div className="validation-error" key={`e-${index}`}>錯誤：{issue.message}</div>)}
        {validation.warnings.slice(0, 8).map((issue, index) => <div className="validation-warning" key={`w-${index}`}>提醒：{issue.message}</div>)}
        {validation.warnings.length > 8 && <div>另有 {validation.warnings.length - 8} 項提醒。</div>}
      </div>}
      <div className="dialog-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={importData}>驗證並載入</button></div>
    </div>
  </div>;
};
