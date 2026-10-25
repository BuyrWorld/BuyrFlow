/**
 * Currency conversion, and keeping it out of the cost argument.
 *
 * A supplier prices in one currency; the buyer reports in another. When the
 * rate moves, the buyer's cost changes without any input cost changing at all.
 * Treating that as a cost increase — or letting a supplier claim it as one
 * alongside a material index — counts the same money twice.
 *
 * So conversion here is always explicit, always dated, and always decomposed:
 *
 *     total change = cost effect + FX effect + cross term
 *
 * The three sum exactly to the total, which is the point. A buyer can then
 * argue about the cost effect, absorb or hedge the FX effect, and see the
 * interaction rather than having it smuggled into one number.
 *
 * There is no default rate and no rate lookup. A rate without a date and a
 * source is not evidence.
 */

import { SCALE, ONE, scaleDiv, money, moneyTimesQuantity, ratioFromDecimalString } from "./exact.mjs";

/**
 * A dated exchange rate.
 *
 *   fxRate({ from: "EUR", to: "GBP", rate: "0.8500", asOf: "2025-01", source: "..." })
 *
 * `rate` is how many units of `to` one unit of `from` buys.
 */
export function fxRate({ from, to, rate, asOf, source }) {
  if (!/^[A-Z]{3}$/.test(from || "")) throw new RangeError(`Not an ISO currency: ${from}`);
  if (!/^[A-Z]{3}$/.test(to || "")) throw new RangeError(`Not an ISO currency: ${to}`);
  if (from === to) throw new RangeError(`A rate from ${from} to itself is meaningless`);
  if (!asOf) throw new TypeError("An exchange rate without a date is not evidence — supply asOf");
  if (!source) throw new TypeError("An exchange rate without a source is not evidence — supply source");
  const scaled = ratioFromDecimalString(rate);
  if (scaled <= 0n) throw new RangeError("An exchange rate must be positive");
  return Object.freeze({ from, to, rate: scaled, asOf, source });
}

/** Convert Money using an explicit rate. Currencies must line up. */
export function convertMoney(m, rate) {
  if (m.currency !== rate.from) {
    throw new RangeError(
      `Cannot convert ${m.currency} with a ${rate.from}->${rate.to} rate. ` +
      `Supply a rate whose 'from' matches the amount's currency.`
    );
  }
  return money(scaleDiv(m.minor * rate.rate, SCALE), rate.to, rate.asOf);
}

/** Movement between two rates, as a Ratio. Positive means `from` strengthened. */
export function rateMovement(baseRate, measureRate) {
  assertComparable(baseRate, measureRate);
  return scaleDiv((measureRate.rate - baseRate.rate) * SCALE, baseRate.rate);
}

function assertComparable(a, b) {
  if (a.from !== b.from || a.to !== b.to) {
    throw new RangeError(
      `Rates are not comparable: ${a.from}->${a.to} against ${b.from}->${b.to}.`
    );
  }
}

/**
 * Split a change in buyer-currency cost into its causes.
 *
 * The supplier's price moves in THEIR currency; the rate moves independently.
 * Both reach the buyer's ledger, and they are not the same argument.
 *
 * @param {object} opts
 * @param {object} opts.unitPrice     baseline unit price, in the SUPPLIER's currency
 * @param {bigint} opts.priceChange   the change requested, as a Ratio
 * @param {object} opts.baseRate      rate at the baseline date
 * @param {object} opts.measureRate   rate at the effective date
 * @param {number} opts.annualVolume
 */
export function decomposeCurrencyEffect({ unitPrice, priceChange, baseRate, measureRate, annualVolume }) {
  assertComparable(baseRate, measureRate);
  if (unitPrice.currency !== baseRate.from) {
    throw new RangeError(
      `Baseline is in ${unitPrice.currency} but the rate converts ${baseRate.from}. ` +
      `The baseline must be stated in the supplier's currency.`
    );
  }

  const vol = BigInt(annualVolume);
  const lineSupplier = moneyTimesQuantity(unitPrice, vol);   // old price, old volume, supplier ccy
  const L = lineSupplier.minor;
  const r0 = baseRate.rate;
  const r1 = measureRate.rate;
  const dP = priceChange;                                     // ratio
  const dR = r1 - r0;                                         // absolute rate delta

  // old buyer-currency value  = L * r0
  // new buyer-currency value  = L * (1 + dP) * r1
  // difference decomposes exactly into three terms:
  const costEffect  = scaleDiv(L * dP, SCALE) * r0 / SCALE;   // (L*dP) at the OLD rate
  const fxEffect    = L * dR / SCALE;                          // old value revalued
  const crossTerm   = scaleDiv(L * dP, SCALE) * dR / SCALE;    // the interaction

  // Compute the exact endpoints too, so the decomposition can be proved to add up.
  const oldBuyer = scaleDiv(L * r0, SCALE);
  const newBuyer = scaleDiv(scaleDiv(L * (ONE + dP), SCALE) * r1, SCALE);

  const cur = baseRate.to;
  const mk = (minor) => money(minor, cur, measureRate.asOf);

  const total = newBuyer - oldBuyer;
  const summed = costEffect + fxEffect + crossTerm;
  // Rounding can leave at most a penny or two between the two routes; attribute
  // it to the cross term rather than letting the parts disagree with the whole.
  const residual = total - summed;

  return Object.freeze({
    currency: cur,
    supplierCurrency: baseRate.from,
    oldBuyerValue: mk(oldBuyer),
    newBuyerValue: mk(newBuyer),
    totalChange: mk(total),
    costEffect: mk(costEffect),
    fxEffect: mk(fxEffect),
    crossTerm: mk(crossTerm + residual),
    rateMovement: rateMovement(baseRate, measureRate),
    priceChange,
    baseRate,
    measureRate,
    lineage:
      `${baseRate.from}->${baseRate.to} ${fmtRate(r0)} at ${baseRate.asOf} (${baseRate.source}), ` +
      `${fmtRate(r1)} at ${measureRate.asOf} (${measureRate.source})`,
    method:
      "total = cost effect (price change at the base rate) + FX effect (base value " +
      "revalued at the new rate) + cross term (the interaction). The three sum to the total.",
  });
}

/**
 * Catch a supplier claiming currency movement as a cost driver while the buyer
 * is ALSO converting at a new rate. That is the same money twice.
 */
export function detectCurrencyDoubleCount(drivers, fxConfigured) {
  if (!fxConfigured) return null;
  const offenders = (drivers || []).filter(
    (d) => d.isCurrency === true || /^(currency|fx|exchange)/i.test(d.id || "") || /\b(currency|fx|exchange rate)\b/i.test(d.label || "")
  );
  if (offenders.length === 0) return null;
  return {
    id: "currency-double-count",
    drivers: offenders.map((d) => d.id),
    text:
      `A currency driver (${offenders.map((d) => d.label || d.id).join(", ")}) is claimed as an input ` +
      `cost while the baseline is also being converted at a dated rate. That counts the exchange ` +
      `movement twice. Remove the driver and read the FX effect from the currency decomposition, ` +
      `which separates it from real cost movement.`,
  };
}

function fmtRate(scaled) {
  const whole = scaled / SCALE;
  const frac = (scaled % SCALE).toString().padStart(9, "0").slice(0, 4);
  return `${whole}.${frac}`;
}
