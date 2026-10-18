/**
 * A deterministic clock and id source, so a test reads the same every run,
 * and a `step` that drives state only through apply() — the same door the
 * page uses. No test in this suite assigns to state directly.
 */

import * as D from "../public/domain.js";

export const BUYER = Object.freeze({ name: "Sam Patel", role: "Buyer" });
export const MANAGER = Object.freeze({ name: "Jo Reid", role: "Commodity Manager" });
export const DIRECTOR = Object.freeze({ name: "Alex Morgan", role: "Procurement Director" });
export const TODAY = "2026-10-18";

export function workspace(initial = D.seedState()) {
  let s = initial;
  let clock = Date.parse("2026-10-18T08:00:00.000Z");
  let n = 0;
  const step = (command, actor = BUYER) => {
    clock += 60_000;
    const out = D.apply(s, command, actor, {
      now: new Date(clock).toISOString(),
      today: TODAY,
      id: () => `id-${String(++n).padStart(6, "0")}`,
    });
    s = out.state;
    return out;
  };
  return {
    step,
    get state() { return s; },
    case: (ref) => s.cases.find((c) => c.ref === ref),
    action: (ref) => s.actions.find((a) => a.ref === ref),
    evidence: (ref, title) => s.cases.find((c) => c.ref === ref).evidence.find((e) => e.title === title),
  };
}

/** Expect a refusal with this code; returns its message. */
export function refused(fn, code) {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof D.Refusal)) throw e;
    if (code && e.code !== code) throw new Error(`refused with ${e.code} ("${e.message}"), expected ${code}`);
    return e.message;
  }
  throw new Error(`expected a refusal${code ? ` (${code})` : ""}, but the command was applied`);
}
