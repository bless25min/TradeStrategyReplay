import { Database, ShieldCheck } from 'lucide-react';
import type { MarketMeta, StrategyMeta, StrategyMetrics } from '../../types';

interface Props { strategy: StrategyMeta; market: MarketMeta; metrics: StrategyMetrics; }
const dataTypeLabel = { backtest: '歷史回測模擬', paper: '擬真紀錄', live: '實盤紀錄' } as const;

export const StrategyHeader = ({ strategy, market, metrics }: Props) => (
  <header className="strategy-header">
    <div className="strategy-identity">
      <div className="eyebrow"><ShieldCheck size={15} /> Strategy Replay</div>
      <div className="title-row"><h1>{strategy.name}</h1><span className="platform-badge">{strategy.platform}</span></div>
      <div className="meta-row"><span>{market.instrument} · {market.symbol}</span><span>{market.timeframe}</span><span className="data-type"><Database size={13} /> {dataTypeLabel[strategy.dataType]}</span></div>
    </div>
    <div className="metrics-row">
      <div className="metric"><span>累積損益</span><strong className={metrics.totalPnlPoints >= 0 ? 'positive' : 'negative'}>{metrics.totalPnlPoints >= 0 ? '+' : ''}{metrics.totalPnlPoints.toFixed(0)} 點</strong></div>
      <div className="metric"><span>最大回撤</span><strong>-{metrics.maxDrawdownPoints.toFixed(0)} 點</strong></div>
      <div className="metric"><span>勝率</span><strong>{metrics.winRate.toFixed(1)}%</strong></div>
      <div className="metric"><span>交易</span><strong>{metrics.tradeCount} 筆</strong></div>
    </div>
  </header>
);
