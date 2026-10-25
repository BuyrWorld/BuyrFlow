/**
 * Index series: base periods and lag.
 *
 * A supplier says "steel is up 14%". Two questions decide whether that figure
 * belongs in a price:
 *
 *   1. Up from WHEN? Movement is meaningless without a base period, and the
 *      contractual base is rarely the one a supplier picks. Choosing a
 *      favourable trough is the single cheapest way to inflate a claim, and it
 *      is invisible unless you recompute from the contract.
 *
 *   2. Has it reached the part yet? An index moving this month does not change
 *      the cost of something bought on material purchased three months ago.
 *      Claiming unlagged movement charges for cost the supplier has not yet
 *      incurred.
 *
 * Nothing here interpolates, extrapolates or guesses. A missing observation is
 * an error, because a quietly invented data point is worse than a stopped
 * calculation.
 */

import { SCALE, scaleDiv, ratioFromDecimalString } from "./exact.mjs";

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

/* ------------------------------------------------------------- periods --- */

/** "2026-03" -> months since year zero, for arithmetic. */
export function periodToMonths(period) {
  const m = PERIOD.exec(String(period).trim());
  if (!m) throw new RangeError(`Not a YYYY-MM period: ${JSON.stringify(period)}`);
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
}

/** Inverse of periodToMonths. */
export function monthsToPeriod(months) {
  const y = Math.floor(months / 12);
  const mo = months % 12;
  return `${String(y).padStart(4, "0")}-${String(mo + 1).padStart(2, "0")}`;
}

/** Shift a period by a whole number of months. `shiftPeriod("2026-03", -3)`. */
export function shiftPeriod(period, months) {
  if (!Number.isInteger(months)) throw new TypeError("Month shift must be an integer");
  return monthsToPeriod(periodToMonths(period) + months);
}

/** Months from one period to another, signed. */
export function periodsBetween(from, to) {
  return periodToMonths(to) - periodToMonths(from);
}

/* -------------------------------------------------------------- series --- */

/**
 * Build an index series from dated observations.
 * Values are decimal strings so nothing is lost to floating point.
 *
 *   createSeries("steel-a", "Synthetic Steel A", [["2025-01","100"],["2025-02","103.4"]])
 */
export function createSeries(id, name, observations, meta = {}) {
  if (!id) throw new TypeError("An index series needs an id");
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new TypeError(`Index "${id}" has no observations`);
  }
  const values = new Map();
  for (const [period, value] of observations) {
    const key = monthsToPeriod(periodToMonths(period)); // validates + normalises
    if (values.has(key)) throw new RangeError(`Index "${id}" has two observations for ${key}`);
    const scaled = ratioFromDecimalString(value);
    if (scaled <= 0n) throw new RangeError(`Index "${id}" value at ${key} must be positive`);
    values.set(key, scaled);
  }
  const periods = [...values.keys()].sort();
  return Object.freeze({
    id,
    name: name || id,
    source: meta.source ?? null,
    synthetic: meta.synthetic !== false, // demonstration data unless stated otherwise
    values,
    first: periods[0],
    last: periods[periods.length - 1],
    count: periods.length,
  });
}

/** Read one observation. Missing is an error — never interpolated. */
export function observationAt(series, period) {
  const key = monthsToPeriod(periodToMonths(period));
  const v = series.values.get(key);
  if (v === undefined) {
    throw new RangeError(
      `Index "${series.id}" has no observation for ${key}. ` +
      `It covers ${series.first} to ${series.last}. ` +
      `Supply the figure or choose a period the series actually covers — ` +
      `this calculation will not interpolate one.`
    );
  }
  return v;
}

/* ------------------------------------------------------------ movement --- */

/**
 * Movement between two periods, with an optional lag.
 *
 * @param {object} opts
 * @param {object} opts.series
 * @param {string} opts.basePeriod      the CONTRACTUAL base, not the supplier's choice
 * @param {string} opts.measurePeriod   the period the claim is measured to
 * @param {number} [opts.lagMonths=0]   months before movement reaches the price
 * @param {boolean} [opts.lagBase=false] apply the lag to the base too (symmetric
 *                                       form used by some contracts)
 * @returns {{movement: bigint, basePeriodUsed, measurePeriodUsed, lagMonths, baseValue, measureValue, lineage}}
 */
export function movementBetween({ series, basePeriod, measurePeriod, lagMonths = 0, lagBase = false }) {
  if (!Number.isInteger(lagMonths) || lagMonths < 0) {
    throw new RangeError("lagMonths must be a non-negative integer");
  }
  const measureUsed = shiftPeriod(measurePeriod, -lagMonths);
  const baseUsed = lagBase ? shiftPeriod(basePeriod, -lagMonths) : monthsToPeriod(periodToMonths(basePeriod));

  if (periodsBetween(baseUsed, measureUsed) < 0) {
    throw new RangeError(
      `Measurement period ${measureUsed} falls before the base ${baseUsed}. ` +
      `Check the lag: ${lagMonths} month(s) applied to ${measurePeriod}.`
    );
  }

  const baseValue = observationAt(series, baseUsed);
  const measureValue = observationAt(series, measureUsed);
  const movement = scaleDiv((measureValue - baseValue) * SCALE, baseValue);

  return Object.freeze({
    movement,
    basePeriodUsed: baseUsed,
    measurePeriodUsed: measureUsed,
    lagMonths,
    baseValue,
    measureValue,
    lineage:
      `${series.name}: ${baseUsed} = ${fmt(baseValue)}, ${measureUsed} = ${fmt(measureValue)}` +
      (lagMonths ? ` (${lagMonths}-month lag applied to ${measurePeriod})` : "") +
      (series.synthetic ? " [synthetic data]" : ""),
  });
}

/**
 * Compare the movement a supplier claimed against the contractual basis.
 *
 * This is base-period shopping made visible: same index, same end date, but a
 * base chosen to flatter. Returns both figures and the overstatement.
 */
export function compareClaimedBasis({ series, claimedBasePeriod, contractualBasePeriod, measurePeriod, lagMonths = 0 }) {
  const claimed = movementBetween({ series, basePeriod: claimedBasePeriod, measurePeriod, lagMonths });
  const contractual = movementBetween({ series, basePeriod: contractualBasePeriod, measurePeriod, lagMonths });
  const overstatement = claimed.movement - contractual.movement;
  return Object.freeze({
    claimed,
    contractual,
    overstatement,
    basesDiffer: claimed.basePeriodUsed !== contractual.basePeriodUsed,
    monthsShifted: periodsBetween(contractual.basePeriodUsed, claimed.basePeriodUsed),
  });
}

/**
 * Show what the lag is worth: the same claim with and without it.
 */
export function compareLag({ series, basePeriod, measurePeriod, lagMonths }) {
  const unlagged = movementBetween({ series, basePeriod, measurePeriod, lagMonths: 0 });
  const lagged = movementBetween({ series, basePeriod, measurePeriod, lagMonths });
  return Object.freeze({
    unlagged,
    lagged,
    overstatement: unlagged.movement - lagged.movement,
    lagMonths,
  });
}

/* -------------------------------------------------------------- helpers --- */

function fmt(scaled) {
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(9, "0").slice(0, 2);
  return (neg ? "-" : "") + whole + "." + frac;
}
