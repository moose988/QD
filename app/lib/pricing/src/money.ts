export type Fils = number & { readonly __brand: 'Fils' };
export type DisplayMode = 'exact' | 'aed' | 'rack50';
export type FxCurrency = keyof typeof FX;

export const FX = Object.freeze({
  USD: 3.6725,
  EUR: 4.235,
  GBP: 4.918,
  INR: 0.03835
});

export function roundFils(value: number): Fils {
  assertFinite(value, 'fils');
  return (Math.sign(value) * Math.round(Math.abs(value))) as Fils;
}

export function AED(value: number): Fils {
  assertFinite(value, 'AED');
  return roundFils(value * 100);
}

export function toAED(value: Fils): number {
  return value / 100;
}

export function fromFils(value: number): Fils {
  if (!Number.isInteger(value)) throw new TypeError(`Expected integer fils, got ${value}`);
  return value as Fils;
}

export function addFils(values: readonly Fils[]): Fils {
  return fromFils(values.reduce((sum, value) => sum + value, 0));
}

export function pct(base: Fils, percent: number): Fils {
  assertFinite(percent, 'percent');
  return roundFils((base * percent) / 100);
}

export function displayAED(value: Fils, mode: DisplayMode = 'exact'): number {
  const aed = toAED(value);
  if (mode === 'exact') return aed;
  if (mode === 'rack50') return Math.round(aed / 50) * 50;
  return Math.round(aed);
}

export function toAEDfromFX(amount: number, currency: FxCurrency): Fils {
  assertFinite(amount, 'FX amount');
  return AED(amount * FX[currency]);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`Expected finite ${label}, got ${value}`);
}
