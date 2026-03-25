import { RiskState, StrategySettings } from "./types";

export function checkRiskGuard(risk: RiskState, spread: number, settings: StrategySettings): { blocked: boolean; reason?: string } {
  if (risk.dayPnl <= -Math.abs(settings.maxDailyLoss)) {
    return { blocked: true, reason: "Max daily loss hit" };
  }
  if (risk.consecutiveLosses >= settings.maxConsecutiveLosses) {
    return { blocked: true, reason: "Max consecutive losses hit" };
  }
  if (risk.cooldownRemaining > 0) {
    return { blocked: true, reason: `Cooldown active (${risk.cooldownRemaining} bars)` };
  }
  if (spread >= settings.extremeSpreadAbs) {
    return { blocked: true, reason: "Extreme spread" };
  }
  return { blocked: false };
}
