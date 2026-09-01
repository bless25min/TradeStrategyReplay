export interface BarData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  contract?: string;
}

export type TradeSide = 'LONG' | 'SHORT';
export type StrategyDataType = 'backtest' | 'paper' | 'live';
export type ReplayMode = 'overview' | 'replay';
export type ContractMode = 'actual' | 'continuous';
export type QuoteFormat = 'csv' | 'json';

export interface MarketMeta {
  id: string;
  instrument: string;
  symbol: string;
  timeframe: string;
  timezone: string;
  utcOffset: string;
  quoteSource?: string;
  session?: string;
  priceAdjustment?: string;
  contractMode?: ContractMode;
  quoteFormat?: QuoteFormat;
  quoteFiles: string[];
}

export interface MarketIndexItem {
  id: string;
  instrument: string;
  symbol: string;
  timeframe: string;
}

export interface MarketBundle {
  meta: MarketMeta;
  quotes: BarData[];
}

export interface StrategyTrade {
  tradeId: string;
  side: TradeSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  pnlPoints: number;
  pnlAmount?: number;
  fees?: number;
  slippage?: number;
  netPnl?: number;
  contract?: string;
  note?: string;
}

export interface ManualTrade {
  id: number;
  side: TradeSide;
  entryTime: number;
  entryPrice: number;
  quantity: number;
  closeTime?: number;
  closePrice?: number;
  pnl?: number;
  status: 'OPEN' | 'CLOSED';
  reason?: 'manual' | 'end_replay' | 'reset';
}

export interface TradingConfig {
  initialBalance: number;
  contractSize: number;
  leverage: number;
}

export interface StrategyMeta {
  id: string;
  name: string;
  platform: string;
  marketId: string;
  dataType: StrategyDataType;
  startDate?: string;
  endDate?: string;
  tradeSource?: string;
  disclaimer?: string;
  initialBalance?: number;
  contractSize?: number;
  leverage?: number;
}

export interface StrategyIndexItem {
  id: string;
  name: string;
  platform: string;
  marketId: string;
  dataType: StrategyDataType;
}

export interface StrategyDefinition {
  meta: StrategyMeta;
  trades: StrategyTrade[];
}

export interface ImportedReplayBundle {
  market: MarketBundle;
  strategy: StrategyDefinition;
}

export interface StrategyMetrics {
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlPoints: number;
  maxDrawdownPoints: number;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  tradeId?: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
