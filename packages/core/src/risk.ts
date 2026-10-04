import type { Impact, Likelihood, RiskLevel } from './enums.js';

// The OWASP Risk Rating matrix with its lowest level, "Note", folded into Low (spec FR-023).
// Storage derives the same value in threats.risk; the agreement test keeps the two identical.
const RISK_MATRIX: Record<Likelihood, Record<Impact, RiskLevel>> = {
  Low: { Low: 'Low', Medium: 'Low', High: 'Medium' },
  Medium: { Low: 'Low', Medium: 'Medium', High: 'High' },
  High: { Low: 'Medium', Medium: 'High', High: 'Critical' },
};

export function deriveRisk(likelihood: Likelihood, impact: Impact): RiskLevel {
  return RISK_MATRIX[likelihood][impact];
}
