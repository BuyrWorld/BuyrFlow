/**
 * Capabilities — Release B, Stage 5.
 *
 * "Existing engines should consume case context and return structured
 * evidence." So a capability is a thin seam, never a second engine:
 *
 *     consume case → structured evidence → recommended work
 *
 * Everything numeric here comes out of `public/engine/`, which is the
 * buyrworld.com calculation engine carried over byte for byte (see its
 * PROVENANCE.json). Nothing in this file does arithmetic on a figure a person
 * will read. If a capability ever needs a number the engine does not produce,
 * the engine is where it gets added.
 *
 * Two rules this seam exists to keep:
 *
 *   - **A capability withholds rather than guesses.** Missing inputs come back
 *     as a named list, never as a default or a zero.
 *   - **A capability proposes; it never decides.** It returns evidence and
 *     suggested work. Writing them is a command, the gates are unchanged, and
 *     nothing it returns can authorise anything.
 */

import { money, SCALE } from "./engine/exact.mjs";
import { costBridge, PROVENANCE } from "./engine/cost-bridge.mjs";
import { formatBp as fmtBp, formatPence } from "./domain.js";

/** Basis points as the engine's Ratio: 780bp → 0.078 scaled by 1e9. */
const bpToRatio = (bp) => (BigInt(bp) * SCALE) / 10_000n;

/** The engine's Ratio back to basis points, for display and for storage. */
const ratioToBp = (r) => Number((BigInt(r) * 10_000n) / SCALE);

/**
 * The Price Increase Defender.
 *
 * A supplier asks for more money. The engine decomposes the ask across the
 * cost drivers, applies each driver's movement, and returns the change the
 * evidence warrants — and the part it does not, which is what a buyer
 * negotiates against.
 *
 * This is a different question from the Case's own `claimExcess`, which asks
 * whether the ask breaches the contractual cap. One is a contract test, the
 * other an evidence test; a claim can fail either, both or neither.
 */
export const defender = {
  id: "defender",
  label: "Price Increase Defender",
  says: "Decomposes the supplier's ask across its cost drivers and shows what the evidence actually warrants.",

  appliesTo: (c) => c.type === "claim",

  /** What the case still needs before the engine can be asked anything. */
  missing(c) {
    const k = c.claim || {};
    const out = [];
    if (!Number.isInteger(k.askBp)) out.push("the increase asked for");
    if (!Number.isInteger(k.unitPricePence)) out.push("the current unit price");
    if (!Number.isInteger(k.annualVolume)) out.push("annual volume");
    const drivers = k.drivers || [];
    if (!drivers.length) out.push("at least one cost driver, with its share of the price and how far its index moved");
    return out;
  },

  /**
   * Run it. Returns either what is missing, or structured evidence and the
   * work it suggests — never a decision, and never a partial figure.
   */
  run(c, { currency = "GBP" } = {}) {
    const missing = this.missing(c);
    if (missing.length) {
      return { ok: false, withheld: `Needs ${missing.join(", ")} before anything can be worked out.`, missing };
    }

    const k = c.claim;
    let bridge;
    try {
      bridge = costBridge({
        baseline: {
          unitPrice: money(BigInt(k.unitPricePence), currency, null),
          annualVolume: k.annualVolume,
        },
        drivers: k.drivers.map((d) => ({
          id: d.id,
          label: d.label,
          weight: bpToRatio(d.weightBp),
          indexMovement: bpToRatio(d.movementBp),
          /* The engine refuses to calculate with anything a person has not
             confirmed. Drivers recorded here were typed by one. */
          provenance: PROVENANCE.USER,
          source: d.source || null,
        })),
        requestedChange: bpToRatio(k.askBp),
        /* Deliberately no `constraints`. The contract cap belongs to
           `claimExcess`, which asks whether the ask breaches it. Passing it
           here would hold the warranted figure down to the contract ceiling,
           and the gap reported below would then include a part the drivers
           do support — described, wrongly, as unevidenced. One question per
           answer; a buyer needs both, separately. */
      });
    } catch (e) {
      /* The engine refusing is a result, not a crash: it means the inputs
         contradict each other, and the sentence says how. */
      return { ok: false, withheld: e.message, missing: [] };
    }

    const warrantedBp = ratioToBp(bridge.warrantedChange);
    const askBp = k.askBp;
    const gapBp = askBp - warrantedBp;

    return {
      ok: true,
      bridge,
      warrantedBp,
      gapBp,
      /* Structured evidence, for the Case to record as DERIVED — produced by
         code, which is the only thing allowed to produce it. */
      evidence: {
        title: "What the cost drivers warrant",
        text: `The supplier asks for ${fmtBp(askBp)}. Across the drivers recorded, the evidence `
          + `warrants ${fmtBp(warrantedBp)}. `
          + (gapBp > 0
            ? `${fmtBp(gapBp)} of the ask is not supported by the drivers given.`
            : gapBp < 0
              ? `The drivers would support more than is being asked for.`
              : `The ask and the evidence agree.`),
        basis: `Weighted decomposition across ${k.drivers.length} driver${k.drivers.length > 1 ? "s" : ""}, `
          + `on a unit price of ${formatPence(k.unitPricePence)} and ${k.annualVolume} a year. `
          + `Integer arithmetic throughout.`,
      },
      /* What a buyer would do next. Suggested, never created. */
      work: gapBp > 0
        ? [{
            title: `Ask the supplier to evidence the ${fmtBp(gapBp)} the drivers do not support`,
            why: "The gap between the ask and the warranted change is the part with no evidence behind it.",
          }]
        : [],
      assumptions: bridge.assumptions || [],
    };
  },
};


/** Every capability this build has. One so far; Stage 5 names six more. */
export const CAPABILITIES = Object.freeze([defender]);

export const capabilityById = (id) => CAPABILITIES.find((x) => x.id === id) || null;

/** The capabilities that could say something about this case. */
export const capabilitiesFor = (c) => CAPABILITIES.filter((x) => x.appliesTo(c));
