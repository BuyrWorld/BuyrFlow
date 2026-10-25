/**
 * The cost bridge.
 *
 * A supplier asks for a price increase. This decomposes the request into cost
 * drivers, applies the movement of each driver's index over the correct period,
 * and produces the change the evidence actually warrants — plus the part that
 * it does not.
 *
 * That second number is the point of the whole thing. The gap between what was
 * requested and what the evidence supports is what a buyer negotiates against.
 *
 * NOTHING HERE MAY BE DELEGATED TO A LANGUAGE MODEL. Same inputs, same answer,
 * every time, or the output cannot be put in front of an approver.
 */

import {
  ONE, ratioMul, scaleDiv, SCALE,
  money, moneyApplyChange, moneySub, moneyTimesQuantity, moneyScale, assertSameCurrency,
} from "./exact.mjs";
import { movementBetween, compareClaimedBasis, compareLag } from "./index-series.mjs";
import { decomposeCurrencyEffect, detectCurrencyDoubleCount } from "./fx.mjs";

/** Where a value came from. Anything ai-inferred must be confirmed first. */
export const PROVENANCE = Object.freeze({
  USER: "user-entered",
  DOCUMENT: "document-extracted",
  EXTERNAL: "externally-sourced",
  CALCULATED: "system-calculated",
  AI: "ai-inferred",
  UNKNOWN: "unknown",
});

/** A value an AI produced may not enter arithmetic until a human confirms it. */
export function assertUsable(field, name) {
  if (!field || typeof field !== "object") return;
  if (field.provenance === PROVENANCE.AI && !field.confirmedBy) {
    throw new Error(
      `Refusing to calculate with unconfirmed AI-inferred value for "${name}". ` +
      `Confirm the extracted field first.`
    );
  }
}

/**
 * @typedef {Object} Driver
 * @property {string} id
 * @property {string} label
 * @property {bigint} weight         share of unit cost, as a Ratio (0.42 = 42%)
 * @property {bigint} indexMovement  movement over the claim period, as a Ratio
 * @property {string} [provenance]
 * @property {object} [confirmedBy]
 * @property {string} [source]
 */

/**
 * @param {Object} input
 * @param {Object} input.baseline           { unitPrice: Money, annualVolume: int }
 * @param {Driver[]} input.drivers
 * @param {bigint} input.requestedChange    Ratio, e.g. 0.09 for +9%
 * @param {Object} [input.constraints]      { cap?, floor?, collar? } as Ratios
 * @param {Object} [input.period]           { months?, retrospectiveMonths? }
 * @param {number} [input.lifetimeYears]
 */
export function costBridge(input) {
  const { baseline, drivers, requestedChange, constraints = {}, period = {}, lifetimeYears = 3, fx = null } = input;

  validate(input);

  const assumptions = [];

  // --- 1. Weighted decomposition -------------------------------------------
  let warranted = 0n;
  const contributions = [];
  let weightTotal = 0n;

  for (const d of drivers) {
    assertUsable(d, `driver "${d.id}" `);

    // A driver may state its movement directly, or name an index and let the
    // engine derive it from the contractual base with the contractual lag.
    // The derived form is the defensible one: it cannot be base-shopped.
    let movement = d.indexMovement;
    let lineage = null;
    let basisNote = null;

    if (d.index) {
      const spec = d.index;
      const series = spec.series;
      if (!series) throw new TypeError(`Driver "${d.id}" names an index but supplies no series`);

      const resolved = movementBetween({
        series,
        basePeriod: spec.contractualBasePeriod ?? spec.basePeriod,
        measurePeriod: spec.measurePeriod,
        lagMonths: spec.lagMonths ?? 0,
        lagBase: spec.lagBase ?? false,
      });
      movement = resolved.movement;
      lineage = resolved.lineage;

      // Did the supplier measure from somewhere more flattering?
      if (spec.claimedBasePeriod && spec.contractualBasePeriod &&
          spec.claimedBasePeriod !== spec.contractualBasePeriod) {
        const cmp = compareClaimedBasis({
          series,
          claimedBasePeriod: spec.claimedBasePeriod,
          contractualBasePeriod: spec.contractualBasePeriod,
          measurePeriod: spec.measurePeriod,
          lagMonths: spec.lagMonths ?? 0,
        });
        basisNote = cmp;
        assumptions.push({
          id: `base-period-${d.id}`,
          text: `${d.label}: the claim measures from ${cmp.claimed.basePeriodUsed} (${pct(cmp.claimed.movement)}), ` +
                `but the contractual base is ${cmp.contractual.basePeriodUsed} (${pct(cmp.contractual.movement)}). ` +
                `Using the contractual base removes ${pct(cmp.overstatement)} of claimed movement.`,
          impact: "reduces warranted change",
        });
      }

      // What did the lag take out?
      if (spec.lagMonths) {
        const lagCmp = compareLag({
          series,
          basePeriod: spec.contractualBasePeriod ?? spec.basePeriod,
          measurePeriod: spec.measurePeriod,
          lagMonths: spec.lagMonths,
        });
        if (lagCmp.overstatement !== 0n) {
          assumptions.push({
            id: `index-lag-${d.id}`,
            text: `${d.label}: a ${spec.lagMonths}-month lag means movement is measured to ` +
                  `${lagCmp.lagged.measurePeriodUsed}, not ${spec.measurePeriod}. ` +
                  `That is ${pct(lagCmp.lagged.movement)} rather than ${pct(lagCmp.unlagged.movement)} — ` +
                  `a difference of ${pct(lagCmp.overstatement)} not yet reached the delivered price.`,
            impact: "reduces warranted change",
          });
        }
      }
    }

    if (typeof movement !== "bigint") {
      throw new TypeError(`Driver "${d.id}" has neither an indexMovement nor a resolvable index`);
    }

    const contribution = ratioMul(d.weight, movement);
    warranted += contribution;
    weightTotal += d.weight;
    contributions.push({
      id: d.id,
      label: d.label,
      weight: d.weight,
      indexMovement: movement,
      contribution,
      source: d.source ?? (d.index?.series?.name ?? null),
      evidence: d.evidence ?? null,
      lineage,
      basis: basisNote
        ? {
            claimedBase: basisNote.claimed.basePeriodUsed,
            contractualBase: basisNote.contractual.basePeriodUsed,
            overstatement: basisNote.overstatement,
            monthsShifted: basisNote.monthsShifted,
          }
        : null,
      provenance: d.provenance ?? PROVENANCE.UNKNOWN,
    });
  }

  // Weight that the supplier has not accounted for. Not an error — a gap.
  const unexplainedWeight = ONE - weightTotal;
  if (unexplainedWeight > 0n) {
    assumptions.push({
      id: "unexplained-weight",
      text: `Drivers account for ${pct(weightTotal)} of unit cost. The remaining ` +
            `${pct(unexplainedWeight)} is unexplained and is treated as unchanged.`,
      impact: "reduces warranted change",
    });
  }

  const warrantedBeforeConstraints = warranted;

  // --- 2. Contract constraints ---------------------------------------------
  let constraintApplied = null;
  if (constraints.cap !== undefined && warranted > constraints.cap) {
    warranted = constraints.cap;
    constraintApplied = "cap";
    assumptions.push({
      id: "cap-applied",
      text: `Contract caps indexation at ${pct(constraints.cap)}; the driver ` +
            `evidence would otherwise support ${pct(warrantedBeforeConstraints)}.`,
      impact: "binding",
    });
  }
  if (constraints.floor !== undefined && warranted < constraints.floor) {
    warranted = constraints.floor;
    constraintApplied = "floor";
    assumptions.push({
      id: "floor-applied",
      text: `Contract floors indexation at ${pct(constraints.floor)}.`,
      impact: "binding",
    });
  }
  // A collar is a symmetric dead-band: movement inside it triggers no change.
  if (constraints.collar !== undefined) {
    const c = constraints.collar < 0n ? -constraints.collar : constraints.collar;
    if (warranted > -c && warranted < c) {
      warranted = 0n;
      constraintApplied = "collar";
      assumptions.push({
        id: "collar-applied",
        text: `Movement of ${pct(warrantedBeforeConstraints)} falls inside the ` +
              `contractual collar of +/-${pct(c)}, so no change is triggered.`,
        impact: "binding",
      });
    }
  }

  // --- 3. Prices and the unsupported remainder ------------------------------
  const unit = baseline.unitPrice;
  const warrantedUnitPrice = moneyApplyChange(unit, warranted);
  const requestedUnitPrice = moneyApplyChange(unit, requestedChange);

  const unsupportedChange = requestedChange - warranted;
  const requestedDelta = moneySub(requestedUnitPrice, unit);
  const warrantedDelta = moneySub(warrantedUnitPrice, unit);
  const unsupportedDelta = moneySub(requestedUnitPrice, warrantedUnitPrice);

  // --- 4. Exposure ----------------------------------------------------------
  // Round ONCE, at the total. Rounding the per-unit delta to 2dp and then
  // multiplying by volume amplifies the rounding error by the volume: a unit
  // price of 0.84 rising 7.5% is exactly 0.903, but forced to 0.90 it
  // understates a 4.2m-unit line by GBP 12,600 a year. So exposure is computed
  // from the exact product (unit x quantity) x change.
  //
  // The per-unit deltas above remain 2dp because that is what a price list
  // shows; they are for display, not for multiplying.
  const vol = BigInt(baseline.annualVolume);
  const exposureFor = (quantity, changeRatio) =>
    moneyScale(moneyTimesQuantity(unit, quantity), changeRatio);

  const annual = {
    requested: exposureFor(vol, requestedChange),
    warranted: exposureFor(vol, warranted),
    unsupported: exposureFor(vol, unsupportedChange),
  };

  const lifeVol = vol * BigInt(lifetimeYears);
  const lifetime = {
    requested: exposureFor(lifeVol, requestedChange),
    warranted: exposureFor(lifeVol, warranted),
    unsupported: exposureFor(lifeVol, unsupportedChange),
  };

  // Retrospective application: volume already delivered under the old price.
  let retrospective = null;
  if (period.retrospectiveMonths) {
    const months = BigInt(period.retrospectiveMonths);
    const retroVol = scaleDiv(vol * months, 12n);
    retrospective = {
      months: period.retrospectiveMonths,
      units: retroVol,
      requested: exposureFor(retroVol, requestedChange),
      warranted: exposureFor(retroVol, warranted),
      unsupported: exposureFor(retroVol, unsupportedChange),
    };
    assumptions.push({
      id: "retrospective",
      text: `${period.retrospectiveMonths} month(s) of retrospective application ` +
            `covers approximately ${retroVol} units already delivered.`,
      impact: "increases exposure",
    });
  }

  // --- 5. Currency -----------------------------------------------------------
  // A rate move is not a cost move. When the buyer reports in a different
  // currency from the one the supplier prices in, the change is split so the
  // cost argument can be had separately from the currency one.
  let currency = null;
  if (fx) {
    if (!fx.baseRate || !fx.measureRate) {
      throw new TypeError("A currency decomposition needs both a baseRate and a measureRate");
    }
    currency = decomposeCurrencyEffect({
      unitPrice: unit,
      priceChange: requestedChange,
      baseRate: fx.baseRate,
      measureRate: fx.measureRate,
      annualVolume: baseline.annualVolume,
    });
    assumptions.push({
      id: "currency-effect",
      text: `Of the ${currency.currency} ${fmtMoney(currency.totalChange)} total change, ` +
            `${currency.currency} ${fmtMoney(currency.fxEffect)} is exchange-rate movement ` +
            `(${pct(currency.rateMovement)}) rather than input cost. ${currency.lineage}.`,
      impact: "separates currency from cost",
    });
  }

  return Object.freeze({
    annualVolume: baseline.annualVolume,
    currency,
    warrantedChange: warranted,
    warrantedBeforeConstraints,
    requestedChange,
    unsupportedChange,
    constraintApplied,
    unexplainedWeight,
    unitPrice: { baseline: unit, warranted: warrantedUnitPrice, requested: requestedUnitPrice },
    delta: { requested: requestedDelta, warranted: warrantedDelta, unsupported: unsupportedDelta },
    annual,
    lifetime,
    retrospective,
    contributions,
    assumptions,
    // Enough to reproduce this result by hand.
    formula: "warranted = Σ(driver.weight × driver.indexMovement), then cap/floor/collar",
  });
}

/**
 * Effect of accepting only part of the request.
 * `acceptedChange` is a Ratio: what you are willing to concede.
 */
export function partialAcceptance(bridge, acceptedChange, annualVolume) {
  const unit = bridge.unitPrice.baseline;
  const vol = BigInt(annualVolume ?? bridge.annualVolume);
  const accepted = moneyApplyChange(unit, acceptedChange);
  const line = moneyTimesQuantity(unit, vol);
  return Object.freeze({
    acceptedChange,
    acceptedUnitPrice: accepted,
    annualCost: moneyScale(line, acceptedChange),
    annualAvoided: moneyScale(line, bridge.requestedChange - acceptedChange),
    versusWarranted: acceptedChange - bridge.warrantedChange,
  });
}
/**
 * Effect of delaying implementation by N months — the increase applies to
 * (12 - N)/12 of the year's volume instead of all of it.
 */
export function delayEffect(bridge, months, annualVolume) {
  if (months < 0 || months > 12) throw new RangeError("Delay must be 0-12 months");
  const unit = bridge.unitPrice.baseline;
  const vol = BigInt(annualVolume ?? bridge.annualVolume);
  const affected = scaleDiv(vol * BigInt(12 - months), 12n);
  const avoidedUnits = vol - affected;
  return Object.freeze({
    months,
    affectedUnits: affected,
    avoidedUnits,
    firstYearCost: moneyScale(moneyTimesQuantity(unit, affected), bridge.requestedChange),
    firstYearAvoided: moneyScale(moneyTimesQuantity(unit, avoidedUnits), bridge.requestedChange),
  });
}

/* -------------------------------------------------------------- validation */

function validate(input) {
  const { baseline, drivers, requestedChange } = input;

  if (!baseline || !baseline.unitPrice) throw new TypeError("baseline.unitPrice is required");
  if (typeof baseline.annualVolume !== "number" || !Number.isInteger(baseline.annualVolume)) {
    throw new TypeError("baseline.annualVolume must be an integer number of units");
  }
  if (baseline.annualVolume < 0) throw new RangeError("annualVolume cannot be negative");
  if (typeof requestedChange !== "bigint") throw new TypeError("requestedChange must be a Ratio (BigInt)");
  if (!Array.isArray(drivers) || drivers.length === 0) throw new TypeError("At least one cost driver is required");

  const seen = new Set();
  let total = 0n;
  for (const d of drivers) {
    if (!d.id) throw new TypeError("Every driver needs an id");
    if (seen.has(d.id)) throw new RangeError(`Duplicate driver id: ${d.id}`);
    seen.add(d.id);
    if (typeof d.weight !== "bigint") throw new TypeError(`Driver "${d.id}" weight must be a Ratio (BigInt)`);
    const hasMovement = typeof d.indexMovement === "bigint";
    const hasIndex = d.index && d.index.series && d.index.measurePeriod;
    if (!hasMovement && !hasIndex) {
      throw new TypeError(
        `Driver "${d.id}" needs either an indexMovement (Ratio) or an index ` +
        `{ series, measurePeriod, contractualBasePeriod }`
      );
    }
    if (d.weight < 0n) throw new RangeError(`Driver "${d.id}" weight cannot be negative`);
    total += d.weight;
  }
  if (total > ONE) {
    throw new RangeError(
      `Driver weights total ${pct(total)}, which exceeds 100% of unit cost. ` +
      `Check for double counting — freight inside both material and logistics is the usual cause.`
    );
  }

  const clash = detectCurrencyDoubleCount(drivers, Boolean(input.fx));
  if (clash) throw new RangeError(clash.text);

  const { cap, floor } = input.constraints ?? {};
  if (cap !== undefined && floor !== undefined && floor > cap) {
    throw new RangeError("Contract floor cannot exceed contract cap");
  }
}

function fmtMoney(m) {
  const neg = m.minor < 0n;
  const abs = neg ? -m.minor : m.minor;
  return (neg ? "-" : "") + (abs / 100n) + "." + (abs % 100n).toString().padStart(2, "0");
}

function pct(r) {
  const hundredths = scaleDiv(r * 10000n, SCALE);
  const neg = hundredths < 0n;
  const abs = neg ? -hundredths : hundredths;
  return (neg ? "-" : "") + (abs / 100n) + "." + (abs % 100n).toString().padStart(2, "0") + "%";
}

export { pct as formatPercent };

export { movementBetween, compareClaimedBasis, compareLag } from "./index-series.mjs";
export { createSeries } from "./index-series.mjs";
export { fxRate, convertMoney, decomposeCurrencyEffect, rateMovement } from "./fx.mjs";
