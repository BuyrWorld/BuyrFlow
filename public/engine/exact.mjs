/**
 * Exact arithmetic primitives.
 *
 * Floating point is not permitted anywhere in the calculation layer. A price
 * that a buyer puts in front of an approver must be reproducible to the penny,
 * and 0.1 + 0.2 !== 0.3 in IEEE-754 doubles.
 *
 * Two representations, both backed by BigInt:
 *
 *   Ratio  — a dimensionless proportion, scaled by 1e9 ("nano").
 *            5% is 0.05 is 50_000_000n.
 *   Money  — an integer count of minor units (pence, cents) plus its currency
 *            and the date the figure applies to.
 *
 * Rounding happens only where it is named, and is always half-up away from
 * zero, which is what commercial practice expects.
 */

export const SCALE = 1_000_000_000n; // 1e9
export const ONE = SCALE;

/* ------------------------------------------------------------------ Ratio */

/** Build a Ratio from a percentage. `ratioFromPercent(4.5)` -> 4.5%. */
export function ratioFromPercent(percent) {
  return scaleDiv(ratioFromDecimalString(percent), 100n);
}

/**
 * Parse a decimal string or integer into a Ratio (value * 1e9).
 * Accepts "0.045", 0.045, "4.5e-2" is NOT accepted — be explicit.
 */
export function ratioFromDecimalString(input) {
  const s = String(input).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new RangeError(`Not a plain decimal: ${JSON.stringify(input)}`);
  }
  const neg = s.startsWith("-");
  const [intPart, fracPart = ""] = (neg ? s.slice(1) : s).split(".");
  if (fracPart.length > 9) {
    throw new RangeError(`More than 9 decimal places loses precision: ${s}`);
  }
  const padded = (fracPart + "000000000").slice(0, 9);
  const magnitude = BigInt(intPart) * SCALE + BigInt(padded);
  return neg ? -magnitude : magnitude;
}

/** Multiply two Ratios, rounding half-up. */
export function ratioMul(a, b) {
  return scaleDiv(a * b, SCALE);
}

/** Format a Ratio as a percentage string, e.g. "4.50%". */
export function ratioToPercentString(r, dp = 2) {
  const asPercent = r * 100n;
  return divToFixed(asPercent, SCALE, dp) + "%";
}

/* ------------------------------------------------------------------ Money */

/**
 * @param {bigint} minor  integer minor units (pence)
 * @param {string} currency  ISO 4217
 * @param {string} asOf  ISO date this figure applies to
 */
export function money(minor, currency, asOf) {
  if (typeof minor !== "bigint") throw new TypeError("Money.minor must be a BigInt");
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError(`Not an ISO currency: ${currency}`);
  return Object.freeze({ minor, currency, asOf: asOf ?? null });
}

/** Build Money from a decimal string: moneyFromDecimal("12.34", "GBP"). */
export function moneyFromDecimal(input, currency, asOf) {
  const s = String(input).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
    throw new RangeError(`Not a 2dp money value: ${JSON.stringify(input)}`);
  }
  const neg = s.startsWith("-");
  const [intPart, fracPart = ""] = (neg ? s.slice(1) : s).split(".");
  const minor = BigInt(intPart) * 100n + BigInt((fracPart + "00").slice(0, 2));
  return money(neg ? -minor : minor, currency, asOf);
}

/** Reject arithmetic across currencies rather than silently producing nonsense. */
export function assertSameCurrency(a, b, context = "operation") {
  if (a.currency !== b.currency) {
    throw new RangeError(
      `Cannot ${context} across currencies (${a.currency} vs ${b.currency}). ` +
      `Convert explicitly with a dated FX rate first.`
    );
  }
}

export function moneyAdd(a, b) {
  assertSameCurrency(a, b, "add");
  return money(a.minor + b.minor, a.currency, a.asOf ?? b.asOf);
}

export function moneySub(a, b) {
  assertSameCurrency(a, b, "subtract");
  return money(a.minor - b.minor, a.currency, a.asOf ?? b.asOf);
}

/** Scale Money by a Ratio, rounding half-up. */
export function moneyScale(m, ratio) {
  return money(scaleDiv(m.minor * ratio, SCALE), m.currency, m.asOf);
}

/** Apply a proportional change: 100.00 with +4.5% -> 104.50. */
export function moneyApplyChange(m, changeRatio) {
  return moneyScale(m, ONE + changeRatio);
}

/** Multiply Money by an integer quantity. Exact — no rounding needed. */
export function moneyTimesQuantity(m, quantity) {
  const q = BigInt(quantity);
  return money(m.minor * q, m.currency, m.asOf);
}

/** Format Money for display or assertion: "104.50". */
export function moneyToDecimalString(m) {
  const neg = m.minor < 0n;
  const abs = neg ? -m.minor : m.minor;
  const major = abs / 100n;
  const minor = abs % 100n;
  return (neg ? "-" : "") + major.toString() + "." + minor.toString().padStart(2, "0");
}

/* -------------------------------------------------------------- internals */

/** Divide BigInts with half-up-away-from-zero rounding. */
export function scaleDiv(numerator, denominator) {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const neg = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const remainder = n % d;
  const roundUp = remainder * 2n >= d;
  const magnitude = roundUp ? q + 1n : q;
  return neg ? -magnitude : magnitude;
}

/** Render numerator/denominator to a fixed number of decimal places. */
function divToFixed(numerator, denominator, dp) {
  const factor = 10n ** BigInt(dp);
  const scaled = scaleDiv(numerator * factor, denominator);
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const whole = abs / factor;
  const frac = abs % factor;
  const fracStr = dp > 0 ? "." + frac.toString().padStart(dp, "0") : "";
  return (neg ? "-" : "") + whole.toString() + fracStr;
}
