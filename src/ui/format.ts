// Number formatting shared by the panel cards.

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export const km = (m: number) => `${(m / 1000).toFixed(2)} km`;
export const hours = (s: number) => `${(s / 3600).toFixed(1)} h`;
export const minutes = (s: number) => `${(s / 60).toFixed(0)} min`;
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

// Signed percentage change, e.g. "−3.9%" / "+2.0%".
export function signedPct(change: number, digits = 1): string {
  if (Math.abs(change) < 0.5 * 10 ** -digits) return `${(0).toFixed(digits)}%`;
  return `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(digits)}%`;
}

// CSS class for a change where lower is better.
export const changeClass = (change: number) => (change < -0.05 ? 'good' : change > 0.05 ? 'bad' : '');
