import type { StrategyMetrics, StrategyTrade } from '../types';

export const calculateMetrics = (trades: StrategyTrade[]): StrategyMetrics => {
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  trades.forEach((trade) => {
    cumulative += trade.pnlPoints;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  });

  const wins = trades.filter((trade) => trade.pnlPoints > 0).length;
  const losses = trades.filter((trade) => trade.pnlPoints < 0).length;
  const totalPnlPoints = trades.reduce((sum, trade) => sum + trade.pnlPoints, 0);

  return {
    tradeCount: trades.length,
    wins,
    losses,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    totalPnlPoints,
    maxDrawdownPoints: maxDrawdown,
  };
};
