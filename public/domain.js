/**
 * BuyrFlow domain — Release A v0.8.0.
 *
 * Everything that decides what a Procurement Case is, and how it may change,
 * lives in this file. It has no DOM, no storage and no clock of its own: the
 * page, the tests and any future agent all change state the same way, through
 * `apply(state, command, actor, ctx)`, and nothing else.
 *
 * What v0.8.0 changed, and why (the independent audit of v0.7.0, 18 Oct 2026):
 *
 *   - Evidence that arrives is *received*, then *assessed* by a named person as
 *     supports / contradicts / insufficient. Receiving text no longer closes a
 *     gap or lowers risk. Nothing is pre-written for the user. (BF-1)
 *   - Evidence is versioned, never overwritten. A decision cites the exact
 *     versions it saw, keeps their text, and goes stale when any of them is
 *     superseded or new material evidence arrives. (BF-2)
 *   - One lifecycle per kind of action, enforced in one place. Nothing is
 *     closed except from Validate; Execute needs an authorising decision; an
 *     outcome needs an action that was executed after that decision. (BF-3)
 *   - Risk is a set of named rules, each returning its inputs. (BF-4)
 *   - No composite supplier score. Quotes are compared on what can be
 *     compared: lead time against the need date, price against the lowest. (BF-5)
 *   - Suppliers are entities with ids; cases reference them. (BF-6, BF-9)
 *   - ISO dates and timestamps everywhere; UUIDs for ids. (BF-7, BF-8)
 *   - Money is integer pence, rates integer basis points. No floats in any
 *     figure shown to a person.
 */

export const SCHEMA = 3;
export const VERSION = "0.8.0";

/* ================================================================ identity */

/** A v4 UUID. randomUUID needs a secure context; getRandomValues does not. */
export function uuid() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("No secure random source is available, so ids cannot be made safely.");
  }
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* =================================================================== dates */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD form. "2026-02-30" is not one. */
export function isIsoDate(s) {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Whole days since 1970-01-01 for an ISO date. Integer, timezone-free. */
export function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export const addDays = (iso, n) => new Date((dayNumber(iso) + n) * 86400000).toISOString().slice(0, 10);
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);

/** Today in the person's own timezone, as an ISO date. */
export function localToday(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Dec 2026". Always with a year: an audit trail without one cannot be ordered. */
export function formatDate(iso) {
  if (!isIsoDate(iso)) return "date not recorded";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** A timestamp as "17 Oct 2026, 09:00 UTC" — the stored value is never reformatted. */
export function formatStamp(ts) {
  if (typeof ts !== "string" || ts.length < 16) return "time not recorded";
  return `${formatDate(ts.slice(0, 10))}, ${ts.slice(11, 16)} UTC`;
}

/* ============================================================ exact numbers */

/** a × b ÷ d, rounded half away from zero, on BigInt so nothing is lost. */
export function mulDivRound(a, b, d) {
  const A = BigInt(a), B = BigInt(b), D = BigInt(d);
  if (D === 0n) throw new Error("division by zero");
  const n = A * B;
  const neg = (n < 0n) !== (D < 0n);
  const an = n < 0n ? -n : n, ad = D < 0n ? -D : D;
  const q = (an * 2n + ad) / (ad * 2n);
  const r = neg ? -q : q;
  const out = Number(r);
  if (!Number.isSafeInteger(out)) throw new Error("result is too large to show exactly");
  return out;
}

/**
 * "£1,234.56" / "1234.5" / "1234" → integer pence, or null if it is not money.
 *
 * Separators are checked before they are removed. Stripping first accepted
 * "12,34.56" as £1,234.56 and "1,2,3" as £123 — a mistyped figure silently
 * becoming a different, plausible one, which then flows into the claim
 * calculation and the approval threshold. Either there are no commas, or they
 * group the digits in threes.
 */
export function parseMoneyToPence(input) {
  const raw = String(input ?? "").trim().replace(/^£/, "");
  if (raw.includes(",") && !/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(raw)) return null;
  const s = raw.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const v = BigInt(whole) * 100n + BigInt((frac + "00").slice(0, 2));
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/** Integer pence → "£1,234.56". */
export function formatPence(p) {
  if (!Number.isInteger(p)) return "—";
  const neg = p < 0, a = Math.abs(p);
  const pounds = String(Math.trunc(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}£${pounds}.${String(a % 100).padStart(2, "0")}`;
}

/** "7.8" / "+7.8%" / "4" → integer basis points (780, 400), or null. */
export function parsePercentToBp(input) {
  const s = String(input ?? "").trim().replace(/%$/, "").replace(/^\+/, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace(/^-/, "").split(".");
  const bp = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return neg ? -bp : bp;
}

/** 780 → "7.80%". */
export function formatBp(bp) {
  if (!Number.isInteger(bp)) return "—";
  const a = Math.abs(bp);
  return `${bp < 0 ? "−" : ""}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, "0")}%`;
}

/** 380 → "3.80 points". */
export const formatPoints = (bp) => formatBp(bp).replace("%", " points");

/* =============================================================== vocabulary */

export const STATE = Object.freeze({
  UNKNOWN: "UNKNOWN",
  SUPPLIED: "SUPPLIED",
  DERIVED: "DERIVED",
  INFERRED: "INFERRED",
  ASSUMED: "ASSUMED",
  CLAIM: "CLAIM",
});

export const STATE_SAID = Object.freeze({
  UNKNOWN: "Unknown — material information still missing",
  SUPPLIED: "Supplied — from a source you can point to",
  DERIVED: "Derived — worked out by code from other evidence",
  INFERRED: "Inferred — an interpretation that needs review",
  ASSUMED: "Assumed — a placeholder somebody chose, with its basis",
  CLAIM: "Claim — somebody said it; not yet evidenced",
});

export const VERDICT = Object.freeze({
  SUPPORTS: "supports",
  CONTRADICTS: "contradicts",
  INSUFFICIENT: "insufficient",
});

export const VERDICT_SAID = Object.freeze({
  supports: "Supports what the case needs",
  contradicts: "Contradicts what the case needs",
  insufficient: "Not enough to judge — ask again",
});

export const RISK_LEVELS = Object.freeze(["Low", "Medium", "High", "Critical"]);
const rank = (level) => RISK_LEVELS.indexOf(level);
const worst = (levels) => levels.reduce((a, b) => (rank(b) > rank(a) ? b : a), "Low");

export const KIND = Object.freeze({ EVIDENCE: "evidence", EXECUTION: "execution", WORKSPACE: "workspace" });

export const STAGE_LABEL = Object.freeze({
  investigate: "Investigate",
  prepare: "Prepare",
  waiting: "Waiting externally",
  decision: "Decision required",
  execute: "Execute",
  validate: "Validate outcome",
  closed: "Closed",
});

/** The six columns of the board. Closed work is not a column. */
export const BOARD = Object.freeze(["investigate", "prepare", "waiting", "decision", "execute", "validate"]);

/** Each kind of action has one path, and only this table says what it is. */
export const LIFECYCLE = Object.freeze({
  evidence: Object.freeze(["investigate", "prepare", "waiting", "validate", "closed"]),
  execution: Object.freeze(["investigate", "prepare", "decision", "execute", "validate", "closed"]),
  workspace: Object.freeze(["investigate", "prepare", "waiting", "validate", "closed"]),
});

/**
 * The kinds of case BuyrFlow knows, and the evidence each one needs before a
 * decision is defensible. A new case starts with these as material gaps, so a
 * junior buyer is told what to go and get rather than "supporting evidence".
 */
export const CASE_TYPES = Object.freeze({
  claim: {
    label: "Supplier price or terms change",
    title: "Review a supplier commercial-change request",
    checklist: ["Contract price-adjustment clause", "Supplier cost breakdown (cost bridge)",
      "Index basis and base period", "Effective date and notice given"],
  },
  shortage: {
    label: "Shortage or late delivery",
    title: "Recover supply or delivery risk",
    checklist: ["Need-by date and quantity confirmed", "Current stock and usage",
      "Supplier recovery date in writing", "Approved alternative sources"],
  },
  sourcing: {
    label: "Find or add a supplier",
    title: "Source an alternative supplier",
    checklist: ["Requirement and drawing revision", "Candidate suppliers' capability evidence",
      "Capacity at full rate", "Qualification route (FAI or PPAP)"],
  },
  quote: {
    label: "Compare quotations",
    title: "Compare supplier quotations",
    checklist: ["Like-for-like scope across quotes", "Commercial terms (Incoterms, tooling, payment)",
      "Lead time from each supplier", "Approval status of each supplier"],
  },
  performance: {
    label: "Supplier performance or quality",
    title: "Review supplier performance",
    checklist: ["Performance data for the period", "Supplier's root-cause analysis",
      "Corrective action plan with dates"],
  },
  spec: {
    label: "Specification or drawing change",
    title: "Assess a specification change",
    checklist: ["Revised drawing or specification reference", "Supplier's cost and lead-time impact",
      "Quality and first-article requirement"],
  },
  demand: {
    label: "Demand or forecast change",
    title: "Respond to a demand change",
    checklist: ["New demand by period", "Supplier capacity confirmation", "Current stock position"],
  },
});

/* =============================================================== classifier */

/**
 * Whole-word rules. Every match is returned with the words that triggered it,
 * the best type is scored rather than first-come, and the alternatives are
 * offered so the person can correct the guess before anything is created.
 * Anything with no match is refused: "I can't classify that yet".
 */
const RULES = [
  ["performance", [/\bwarranty\b/, /\bquality\b/, /\botd\b/, /\bon[- ]time\b/, /\bperformance\b/,
    /\breject(s|ed|ion)?\b/, /\bdefect(s|ive)?\b/, /\bnon[- ]?conform\w*/, /\bfail(ed|ure|ures)?\b/]],
  ["claim", [/\bprice (increase|rise|change|uplift)\b/, /\bsurcharge\b/, /\bincrease\b/, /\buplift\b/,
    /\bmore money\b/, /\bprices?\b/, /\bpayment terms\b/, /\bindexation\b/]],
  /* The verb forms buyers actually use, not only the nouns a system would.
     "We are going to run out before Christmas" was refused until these went
     in, and the build's own demonstration case is the one it refused. */
  ["shortage", [/\bshortage\b/, /\blate\b/, /\bdelay(s|ed)?\b/, /\bdeliver(y|ies)\b/, /\bstock[- ]?out\b/,
    /\bstop (the )?production\b/, /\bline[- ]stop\b/, /\blead[- ]?times?\b/, /\bslipp?(ed|ing)?\b/,
    /\bmiss(ed|es|ing)?\b/, /\bexpedite\b/, /\br(a|u)n(ning)? out\b/, /\bout of stock\b/,
    /\bshort of\b/, /\bnot (going to |gonna )?(arrive|make it)\b/, /\bbehind schedule\b/,
    /\bwon'?t (arrive|make|deliver)\b/, /\bcan'?t deliver\b/]],
  ["sourcing", [/\bsource\b/, /\bsourcing\b/, /\bsecond supplier\b/, /\bdual[- ]source\w*/,
    /\bsingle[- ]source\w*/, /\bnew supplier\b/, /\balternative supplier\b/,
    /\bfind (another|a new|someone|somebody|an alternative)\b/, /\bsomeone else\b/,
    /\bsomebody else\b/, /\banother supplier\b/, /\bwho else can\b/]],
  ["quote", [/\bquot(e|es|ation|ations)\b/, /\bbids?\b/, /\btenders?\b/, /\bcompare (the )?(offers|prices)\b/]],
  ["spec", [/\bdrawing\b/, /\brev(ision)? [a-z0-9]{1,3}\b/, /\bspecification\b/, /\bspec\b/,
    /\bengineering change\b/, /\becn\b/]],
  ["demand", [/\bforecast\b/, /\bdemand\b/, /\bvolumes? (increase|drop|change)\w*/, /\bdoubled\b/, /\bhalved\b/,
    /\bmoved the rate\b/, /\brate (up|down) to\b/, /\bbuild rate\b/, /\bramp(ed|ing)? (up|down)\b/,
    /\b(more|fewer) per (month|week|year)\b/]],
];

export function classifyProblem(text) {
  const lower = String(text ?? "").trim().toLowerCase();
  if (!lower) return null;
  const scored = RULES.map(([type, rules], order) => {
    const matched = rules.map((r) => lower.match(r)?.[0]).filter(Boolean);
    return { type, order, matched };
  }).filter((x) => x.matched.length);
  if (!scored.length) return null;
  scored.sort((a, b) => b.matched.length - a.matched.length || a.order - b.order);
  const best = scored[0];
  /* One keyword out of a handful of words is a guess, not a reading. "price"
     on its own used to arrive looking exactly as certain as a full sentence
     about a price increase; the screen can now say which it has. */
  const words = lower.split(/\s+/).filter(Boolean).length;
  const confidence = best.matched.length > 1 || words > 3 ? "strong" : "weak";
  return {
    type: best.type,
    title: CASE_TYPES[best.type].title,
    label: CASE_TYPES[best.type].label,
    matched: best.matched,
    confidence,
    alternatives: scored.slice(1).map((x) => x.type),
  };
}

/* ================================================================ refusals */

export class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Refusal";
    this.code = code;
  }
}

function need(cond, code, message) {
  if (!cond) throw new Refusal(code, message);
}

const text = (v) => (typeof v === "string" ? v.trim() : "");

/* ================================================================== lookups */

export const caseById = (s, id) => s.cases.find((c) => c.id === id) || null;
export const supplierById = (s, id) => s.suppliers.find((x) => x.id === id) || null;
export const actionById = (s, id) => s.actions.find((a) => a.id === id) || null;
export const requestById = (s, id) => s.requests.find((r) => r.id === id) || null;
export const decisionById = (s, id) => s.decisions.find((d) => d.id === id) || null;

export function evidenceById(s, id) {
  for (const c of s.cases) {
    const e = c.evidence.find((x) => x.id === id);
    if (e) return { c, e };
  }
  return { c: null, e: null };
}

export const current = (e) => e.versions[e.versions.length - 1];
export const caseActions = (s, caseId) => s.actions.filter((a) => a.caseId === caseId);
export const openActions = (s, caseId) => caseActions(s, caseId).filter((a) => a.stage !== "closed");

/* ================================================================ evidence */

/**
 * What one piece of evidence means right now.
 *
 *   gap          — a question with no answer yet
 *   awaiting     — an answer received, not yet judged by a person
 *   insufficient — judged, and not enough to go on
 *   supported / contradicted — judged against what the case needs
 *   supplied / derived / inferred / assumed / claim — a fact, a calculation,
 *                  an interpretation, a placeholder, or something somebody said
 */
export function evidenceStatus(e) {
  const v = current(e);
  if (v.state === STATE.UNKNOWN) return "gap";
  if (v.state === STATE.SUPPLIED && e.question) {
    if (!v.assessment) return "awaiting";
    if (v.assessment.verdict === VERDICT.INSUFFICIENT) return "insufficient";
    return v.assessment.verdict === VERDICT.SUPPORTS ? "supported" : "contradicted";
  }
  return { SUPPLIED: "supplied", DERIVED: "derived", INFERRED: "inferred", ASSUMED: "assumed", CLAIM: "claim" }[v.state];
}

export const STATUS_SAID = Object.freeze({
  gap: "Gap",
  awaiting: "Received — awaiting assessment",
  insufficient: "Insufficient — ask again",
  supported: "Supports the case",
  contradicted: "Contradicts the case",
  supplied: "Supplied",
  derived: "Derived",
  inferred: "Inferred — to verify",
  assumed: "Assumed — to verify",
  claim: "Claim — not evidenced",
});

const OPEN = new Set(["gap", "awaiting", "insufficient"]);
const TO_ACKNOWLEDGE = new Set(["contradicted", "inferred", "assumed", "claim"]);

/** Material evidence that blocks a decision outright. */
export const openGaps = (c) => c.evidence.filter((e) => e.material && OPEN.has(evidenceStatus(e)));

/** Material evidence a decision may rest on only if it says so, by name. */
export const toAcknowledge = (c) => c.evidence.filter((e) => e.material && TO_ACKNOWLEDGE.has(evidenceStatus(e)));

/* =============================================================== calculations */

/**
 * Shortage timing: for each supplier on the case, when the material would
 * arrive if ordered today, and how that compares with the need date. Lead
 * times are calendar days as quoted. Nothing is shown without a need date.
 */
export function shortageTiming(s, c, today) {
  const needBy = c.requirement?.needBy;
  if (!isIsoDate(needBy)) return { withheld: "No need-by date is recorded, so arrival cannot be compared with it." };
  if (!isIsoDate(today)) return { withheld: "Today's date is not known." };
  const rows = (c.quotes || []).map((q) => {
    const sup = supplierById(s, q.supplierId);
    if (!Number.isInteger(q.leadDays)) {
      return { supplierId: q.supplierId, name: sup?.name || "Unknown supplier", approval: q.approval, withheld: "no lead time" };
    }
    const arrives = addDays(today, q.leadDays);
    const slackDays = daysBetween(arrives, needBy);
    return {
      supplierId: q.supplierId, name: sup?.name || "Unknown supplier", approval: q.approval,
      leadDays: q.leadDays, arrives, slackDays, meets: slackDays >= 0,
    };
  });
  return { needBy, today, daysToNeed: daysBetween(today, needBy), rows };
}

/**
 * A supplier's ask against the contract cap, in basis points and pence a year.
 * Integer arithmetic only; every input is shown beside the result.
 */
export function claimExcess(c) {
  const k = c.claim || {};
  const missing = [];
  if (!Number.isInteger(k.askBp)) missing.push("the increase asked for");
  if (!Number.isInteger(k.capBp)) missing.push("the contract cap");
  if (!Number.isInteger(k.annualSpendPence)) missing.push("annual spend");
  if (missing.length) return { withheld: `Needs ${missing.join(", ")} before anything is worked out.` };
  const excessBp = Math.max(0, k.askBp - k.capBp);
  return {
    askBp: k.askBp, capBp: k.capBp, excessBp,
    spendPence: k.annualSpendPence,
    askPence: mulDivRound(k.annualSpendPence, k.askBp, 10000),
    capPence: mulDivRound(k.annualSpendPence, k.capBp, 10000),
    excessPence: mulDivRound(k.annualSpendPence, excessBp, 10000),
  };
}

/**
 * Quotes compared on what can be compared. No composite score: price is shown
 * against the lowest quote in the same unit, lead time in days, approval as
 * recorded. Weighting them into one number is a policy decision this build
 * does not make for anybody.
 */
export function quoteComparison(s, c) {
  const quotes = (c.quotes || []).filter((q) => Number.isInteger(q.unitPricePence));
  const units = new Set(quotes.map((q) => q.unit));
  const lowest = units.size === 1 && quotes.length ? Math.min(...quotes.map((q) => q.unitPricePence)) : null;
  return (c.quotes || []).map((q) => {
    const sup = supplierById(s, q.supplierId);
    return {
      supplierId: q.supplierId, name: sup?.name || "Unknown supplier", approval: q.approval,
      leadDays: q.leadDays, unit: q.unit, unitPricePence: q.unitPricePence,
      overLowestPence: lowest !== null && Number.isInteger(q.unitPricePence) ? q.unitPricePence - lowest : null,
      otdPct: sup?.otdPct ?? null,
      incumbent: c.incumbentId === q.supplierId,
    };
  });
}

/** The supplier the case currently plans to use: the authorising decision's route, else the incumbent. */
export function plannedRoute(s, c) {
  const d = authorisingDecision(s, c);
  return d?.routeSupplierId || c.incumbentId || null;
}

/* ===================================================================== risk */

/**
 * Risk is the worst of a set of named rules. Each rule says what it looked at,
 * so a person can disagree with the input rather than with a colour.
 */
export function caseRisk(s, c, today) {
  const drivers = [];

  const gaps = openGaps(c);
  const contradicted = c.evidence.filter((e) => e.material && evidenceStatus(e) === "contradicted");
  const soft = c.evidence.filter((e) => e.material && ["inferred", "assumed", "claim"].includes(evidenceStatus(e)));
  if (contradicted.length) {
    drivers.push({ rule: "evidence", level: "Critical",
      said: `${contradicted.length} material item${contradicted.length > 1 ? "s" : ""} contradict${contradicted.length > 1 ? "" : "s"} what the case needs`,
      inputs: contradicted.map((e) => e.title) });
  }
  if (gaps.length) {
    drivers.push({ rule: "evidence", level: "High",
      said: `${gaps.length} material evidence gap${gaps.length > 1 ? "s" : ""} open`,
      inputs: gaps.map((e) => `${e.title} (${STATUS_SAID[evidenceStatus(e)].toLowerCase()})`) });
  }
  if (soft.length) {
    drivers.push({ rule: "evidence", level: "Medium",
      said: `${soft.length} material item${soft.length > 1 ? "s rest" : " rests"} on inference, assumption or claim`,
      inputs: soft.map((e) => e.title) });
  }

  if (c.type === "shortage") {
    const t = shortageTiming(s, c, today);
    if (t.withheld) {
      drivers.push({ rule: "timing", level: "Medium", said: t.withheld, inputs: [] });
    } else if (!t.rows.length) {
      drivers.push({ rule: "timing", level: "Medium", said: "No supplier is linked yet, so arrival cannot be compared with the need date.", inputs: [] });
    } else {
      const route = plannedRoute(s, c);
      const planned = t.rows.find((r) => r.supplierId === route);
      const approvedMeeting = t.rows.filter((r) => r.meets && r.approval === "Approved");
      const name = planned?.name;
      if (t.daysToNeed < 0) {
        drivers.push({ rule: "timing", level: "Critical", said: `The need date ${formatDate(t.needBy)} has passed`, inputs: [t.needBy] });
      } else if (planned && Number.isInteger(planned.slackDays) && planned.slackDays < 0) {
        drivers.push(approvedMeeting.length
          ? { rule: "timing", level: "High",
              said: `${name} misses ${formatDate(t.needBy)} by ${-planned.slackDays} days; ${approvedMeeting.map((r) => r.name).join(", ")} could meet it`,
              inputs: [`lead ${planned.leadDays} days`, `need-by ${t.needBy}`, `today ${today}`] }
          : { rule: "timing", level: "Critical",
              said: `No approved supplier on the case meets ${formatDate(t.needBy)}`,
              inputs: t.rows.map((r) => `${r.name}: ${r.leadDays ?? "?"} days`) });
      } else if (planned && Number.isInteger(planned.slackDays) && planned.slackDays < 7) {
        drivers.push({ rule: "timing", level: "Medium",
          said: `${name} meets ${formatDate(t.needBy)} with only ${planned.slackDays} days' slack`,
          inputs: [`lead ${planned.leadDays} days`, `need-by ${t.needBy}`] });
      } else if (!planned && !approvedMeeting.length) {
        drivers.push({ rule: "timing", level: "Critical", said: `No approved supplier on the case meets ${formatDate(t.needBy)}`,
          inputs: t.rows.map((r) => `${r.name}: ${r.leadDays ?? "?"} days`) });
      }
    }
  }

  if (c.type === "claim") {
    const x = claimExcess(c);
    if (x.withheld) drivers.push({ rule: "claim", level: "Medium", said: x.withheld, inputs: [] });
    else if (x.excessBp > 0) {
      drivers.push({ rule: "claim", level: "Medium",
        said: `The ask exceeds the contract cap by ${formatPoints(x.excessBp)}: ${formatPence(x.excessPence)} a year`,
        inputs: [`ask ${formatBp(x.askBp)}`, `cap ${formatBp(x.capBp)}`, `spend ${formatPence(x.spendPence)} a year`] });
    }
  }

  if (Number.isInteger(c.concentrationPct) && c.concentrationPct >= 80) {
    drivers.push({ rule: "concentration", level: "High",
      said: `${c.concentrationPct}% of volume sits with one supplier`, inputs: [`share ${c.concentrationPct}%`, "threshold 80%"] });
  }

  /* What is at stake decides who has to approve the decision, so not knowing
     it is itself a risk — and the one a reader is least likely to notice,
     because an unvalued case looks calmer than a valued one rather than
     louder. Named here so it is visible long before the decision refuses. */
  if (!Number.isInteger(c.valuePence)) {
    drivers.push({ rule: "authority", level: "Medium",
      said: "What is at stake is not recorded, so the approval threshold cannot be applied",
      inputs: [`threshold ${formatPence(s.settings.secondApprovalAbovePence)}`] });
  }

  return { level: worst(drivers.map((d) => d.level)), drivers };
}

/* ================================================================ decisions */

/** Whether a decision may be acted on now, and if not, why not. */
export function decisionStatus(s, d) {
  if (!d.snapshot) return { status: "legacy", said: "Recorded before evidence snapshots existed; cannot authorise execution." };
  const c = caseById(s, d.caseId);
  if (!c) return { status: "orphaned", said: "Its case no longer exists." };
  const cited = new Map(d.snapshot.evidence.map((x) => [x.evidenceId, x.version]));
  /* Material evidence only: a minor note changing does not undo a decision,
     and materiality is the one judgement the person has already made. */
  const superseded = c.evidence.filter((e) => e.material && cited.has(e.id) && current(e).v !== cited.get(e.id));
  const added = c.evidence.filter((e) => e.material && !cited.has(e.id));
  if (superseded.length || added.length) {
    const parts = [];
    if (superseded.length) parts.push(`${superseded.map((e) => e.title).join(", ")} changed since`);
    if (added.length) parts.push(`${added.map((e) => e.title).join(", ")} arrived since`);
    return { status: "stale", said: `Stale: ${parts.join("; ")}. Re-confirm with a new decision.` };
  }
  if (d.needsSecondApproval && !d.secondApproval) {
    return { status: "awaiting-approval", said: `Needs a second approver: the case value is above ${formatPence(d.thresholdPence)}.` };
  }
  return { status: "authorising", said: "Authorises execution." };
}

export function authorisingDecision(s, c) {
  return s.decisions.filter((d) => d.caseId === c.id).find((d) => decisionStatus(s, d).status === "authorising") || null;
}

/** Everything a decision rests on, frozen with its text. */
function snapshotFor(s, c, today) {
  const risk = caseRisk(s, c, today);
  return {
    risk,
    evidence: c.evidence.map((e) => {
      const v = current(e);
      return {
        evidenceId: e.id, title: e.title, material: e.material, version: v.v, state: v.state,
        status: evidenceStatus(e), text: v.text, source: v.source, basis: v.basis || null,
        verdict: v.assessment?.verdict || null,
      };
    }),
    openActions: openActions(s, c.id).map((a) => ({ id: a.id, ref: a.ref, title: a.title, stage: a.stage, owner: a.owner })),
    calculations: {
      timing: c.type === "shortage" ? shortageTiming(s, c, today) : null,
      claim: c.type === "claim" ? claimExcess(c) : null,
    },
  };
}

/* =================================================================== phase */

export function casePhase(s, c) {
  if (c.outcomes.length) return { id: "learned", label: "Outcome recorded", step: 4 };
  if (openGaps(c).length) return { id: "evidence", label: "Close evidence", step: 1 };
  const decisions = s.decisions.filter((d) => d.caseId === c.id);
  const auth = authorisingDecision(s, c);
  if (!auth) {
    if (decisions.some((d) => decisionStatus(s, d).status === "awaiting-approval")) {
      return { id: "approval", label: "Second approval", step: 2 };
    }
    return { id: "decision", label: "Human decision", step: 2 };
  }
  if (openActions(s, c.id).length || !executedAfter(s, c, auth)) return { id: "execution", label: "Execute and validate", step: 3 };
  return { id: "outcome", label: "Record the outcome", step: 4 };
}

/**
 * An execution action that entered Execute after the decision and has been closed.
 *
 * Strictly after. `>=` let an execution recorded at the decision's own
 * timestamp satisfy "executed after the decision" — unreachable by hand, but
 * not by a scripted agent or anything else running on a fixed clock, which is
 * the direction this build is heading.
 */
function executedAfter(s, c, decision) {
  return caseActions(s, c.id).some((a) => a.kind === KIND.EXECUTION && a.stage === "closed"
    && a.history.some((h) => h.stage === "execute" && h.at > decision.at));
}

export function recommendation(s, c, today) {
  const phase = casePhase(s, c);
  const gaps = openGaps(c);
  if (phase.id === "evidence") {
    const g = gaps[0];
    const st = evidenceStatus(g);
    const linked = openActions(s, c.id).find((a) => a.evidenceId === g.id);
    const verb = st === "awaiting" ? "Assess" : st === "insufficient" ? "Ask again for" : "Get";
    return {
      headline: `${verb}: ${g.title}`,
      reason: `${gaps.length} material evidence gap${gaps.length > 1 ? "s are" : " is"} open. No decision can rest on an unknown, and a received answer counts only once a person has judged it.`,
      next: linked ? `Continue ${linked.ref}: ${linked.title}` : "Create work for the open gaps",
    };
  }
  if (phase.id === "decision" || phase.id === "approval") {
    const ack = toAcknowledge(c);
    /* Said here rather than discovered at the dialog: the decision will be
       refused without it, and being told why one step early is the difference
       between a prompt and a wall. */
    if (phase.id === "decision" && !Number.isInteger(c.valuePence)) {
      return {
        headline: "Record what is at stake",
        reason: "No material gaps are open, so this case is ready to decide — except that what it is worth "
          + "is not recorded. The second-approval threshold is applied to that figure, so a decision taken now "
          + "could not say whether it needed a second name against it.",
        next: "Record the value at stake on this case",
      };
    }
    return {
      headline: phase.id === "approval" ? "Waiting for a second approver" : "Ready for a human decision",
      reason: ack.length
        ? `No material gaps are open. ${ack.length} item${ack.length > 1 ? "s" : ""} the decision would rest on ${ack.length > 1 ? "are" : "is"} not evidence (${ack.map((e) => e.title).join(", ")}); the decider must acknowledge ${ack.length > 1 ? "them" : "it"} by name.`
        : "No material gaps are open and nothing rests on inference. A named person now decides; the evidence they saw is frozen with the decision.",
      next: phase.id === "approval" ? "A second person approves the recorded decision" : "Record the decision",
    };
  }
  if (phase.id === "execution") {
    const auth = authorisingDecision(s, c);
    const next = openActions(s, c.id)[0];
    return {
      headline: "Execute the authorised decision",
      reason: `${auth.title} authorises execution. An outcome can be recorded once an action has been executed after it and every action on the case is closed.`,
      next: next ? `Progress ${next.ref}: ${next.title}` : "Add the action that carries out the decision",
    };
  }
  if (phase.id === "outcome") {
    return {
      headline: "Record the validated outcome",
      reason: "The decision has been executed and nothing on the case is open. Record what actually happened, how it was checked, and by whom.",
      next: "Record the outcome against the decision",
    };
  }
  const o = c.outcomes[0];
  return {
    headline: "Outcome recorded",
    reason: `Validated by ${o.validatedBy.name} (${o.validatedBy.role}) against ${o.decisionRef}.`,
    next: "Watch whether the assumptions behind it stay true",
  };
}

/* ================================================================== seed */

const T0 = "2026-10-17T09:00:00.000Z";
const SEED_ACTOR = Object.freeze({ name: "Review data", role: "Synthetic seed" });

function seedEvidence(id, title, state, textValue, source, { material = false, question = false, basis = null } = {}) {
  return { id, title, material, question, versions: [{ v: 1, state, text: textValue, source, basis, recordedAt: T0, recordedBy: SEED_ACTOR, assessment: null }] };
}

function seedAction(id, ref, fields) {
  return {
    id, ref, kind: KIND.EXECUTION, caseId: null, evidenceId: null, requestId: null, supplierId: null,
    owner: "Buyer", priority: "normal", dueDate: null, completionTest: "", expectedResult: "",
    actualResult: "", dependencies: [], authority: "Buyer", createdAt: T0,
    ...fields,
    history: [{ stage: fields.stage, at: T0, by: SEED_ACTOR }],
  };
}

/** The three synthetic review cases, with ISO dates and integer money. */
export function seedState() {
  const sup = (id, name, category, otdPct, qualityPct, risk, relationship) =>
    ({ id, name, category, otdPct, qualityPct, risk, relationship });
  return {
    schema: SCHEMA,
    rev: 0,
    seq: { case: 3, action: 104, request: 3, decision: 1, outcome: 0 },
    settings: {
      user: null,
      secondApprovalAbovePence: 25_000_000,
    },
    /* Everyone this workspace has seen decide or approve. Grows as people are
       named; not an account list and not verified. */
    people: [],
    suppliers: [
      sup("S-AVEN", "Aven Coil Services", "Specialty strip & coil", 93, 98, "Low", "Strategic"),
      sup("S-TITAN", "Titan Specialty Stock", "Specialty strip & coil", 89, null, "Medium", "Not set"),
      sup("S-NORTH", "Northstar Metals", "Aerospace metals", 84, 97, "High", "Watch"),
      sup("S-KESTREL", "Kestrel CNC", "Precision machining", 95, 96, "Low", "Growth"),
      sup("S-VECTOR", "Vector Precision", "Precision machining", 91, null, "Low", "Not set"),
      sup("S-ORION", "Orion Alloy", "Nickel alloys", 96, 99, "Medium", "Leverage"),
    ],
    cases: [
      {
        id: "C-AMS", ref: "AMS5599", type: "shortage", example: false,
        title: "Recover AMS5599-086 coil supply",
        objective: "Protect December production without accepting an unsupported urgency premium.",
        requirement: { quantity: 8200, unit: "ft", spec: "0.003 × 16 in, AMS5599-086", needBy: "2026-12-11" },
        valuePence: 12_800_000, intakeAssessment: "High", incumbentId: "S-NORTH", concentrationPct: null, claim: null,
        quotes: [
          { supplierId: "S-AVEN", approval: "Approved", leadDays: 39, unitPricePence: 953, unit: "ft" },
          { supplierId: "S-TITAN", approval: "Conditional", leadDays: 28, unitPricePence: 935, unit: "ft" },
          { supplierId: "S-NORTH", approval: "Approved", leadDays: 72, unitPricePence: 1050, unit: "ft" },
        ],
        evidence: [
          seedEvidence("E-AMS-REQ", "Requirement", STATE.SUPPLIED, "8,200 ft to drawing and specification, needed by 11 Dec 2026.", { kind: "document", document: "Buyer requirement", from: "Case intake", date: "2026-10-17" }),
          seedEvidence("E-AMS-LEAD", "Incumbent lead time", STATE.SUPPLIED, "Northstar quotes 72 days.", { kind: "document", document: "Supplier quotation", from: "Northstar Metals", date: "2026-10-17" }),
          seedEvidence("E-AMS-PREM", "Urgency premium", STATE.INFERRED, "Comparable offers suggest the incumbent's urgency premium is not fully supported.", { kind: "analysis", document: "Comparison of commercial positions", from: "Buyer", date: "2026-10-17" }, { material: true }),
          seedEvidence("E-AMS-ALLOC", "Mill allocation", STATE.UNKNOWN, "Written mill allocation has not been supplied.", { kind: "request", document: null, from: "Northstar Metals", date: "2026-10-17" }, { material: true, question: true }),
        ],
        outcomes: [],
      },
      {
        id: "C-MACH", ref: "MACH204", type: "sourcing", example: false,
        title: "Dual-source actuator housings",
        objective: "Reduce single-source exposure without compromising first-pass yield.",
        requirement: { quantity: 1400, unit: "ea", spec: "Rev F, first-article inspection required", needBy: null },
        valuePence: 34_300_000, intakeAssessment: "High", incumbentId: null, concentrationPct: 92, claim: null,
        quotes: [
          { supplierId: "S-KESTREL", approval: "Approved", leadDays: 49, unitPricePence: 24540, unit: "ea" },
          { supplierId: "S-VECTOR", approval: "Approved", leadDays: 56, unitPricePence: 25520, unit: "ea" },
        ],
        evidence: [
          seedEvidence("E-M-CONC", "Concentration", STATE.SUPPLIED, "The incumbent holds 92% of annual volume.", { kind: "document", document: "Spend and sourcing history", from: "Spend data", date: "2026-10-17" }),
          seedEvidence("E-M-FAI", "Quality gate", STATE.SUPPLIED, "Rev F and first-article inspection are mandatory.", { kind: "document", document: "Drawing and quality requirement", from: "Quality", date: "2026-10-17" }),
          seedEvidence("E-M-CAP", "Alternative capability", STATE.INFERRED, "Two suppliers appear technically capable.", { kind: "analysis", document: "Supplier capability review", from: "Buyer", date: "2026-10-17" }, { material: true }),
          seedEvidence("E-M-RATE", "Rate evidence", STATE.UNKNOWN, "Full-rate production capacity has not been evidenced.", { kind: "request", document: null, from: "Kestrel CNC", date: "2026-10-17" }, { material: true, question: true }),
        ],
        outcomes: [],
      },
      {
        id: "C-NI", ref: "NI718", type: "claim", example: false,
        title: "Challenge nickel alloy surcharge",
        objective: "Separate evidenced alloy movement from unsupported supplier surcharge.",
        requirement: { quantity: 12000, unit: "lb", spec: "Annual agreement review", needBy: null },
        valuePence: 23_280_000, intakeAssessment: "Medium", incumbentId: "S-ORION", concentrationPct: null,
        claim: { askBp: 780, capBp: 400, annualSpendPence: 23_280_000, effectiveDate: "2027-01-01" },
        quotes: [{ supplierId: "S-ORION", approval: "Approved", leadDays: 42, unitPricePence: 1940, unit: "lb" }],
        evidence: [
          seedEvidence("E-NI-ASK", "Supplier request", STATE.SUPPLIED, "Orion requests +7.8% from 1 Jan 2027.", { kind: "document", document: "Commercial-change request", from: "Orion Alloy", date: "2026-10-17" }),
          seedEvidence("E-NI-CAP", "Contract position", STATE.SUPPLIED, "The agreement caps movement at 4% without exceptional evidence.", { kind: "document", document: "Supply agreement, price-adjustment clause", from: "Contract", date: "2026-10-17" }),
          seedEvidence("E-NI-BRIDGE", "Cost bridge", STATE.UNKNOWN, "No transparent cost bridge has been supplied.", { kind: "request", document: null, from: "Orion Alloy", date: "2026-10-17" }, { material: true, question: true }),
        ],
        outcomes: [],
      },
    ],
    requests: [
      { id: "R-1", ref: "REQ-0001", caseId: "C-AMS", supplierId: "S-NORTH", evidenceId: "E-AMS-ALLOC", question: "Provide written mill allocation for 8,200 ft by 11 Dec 2026.", dueDate: "2026-10-24", status: "sent", createdAt: T0, sentAt: T0, sentVia: "email", reply: null },
      { id: "R-2", ref: "REQ-0002", caseId: "C-MACH", supplierId: "S-KESTREL", evidenceId: "E-M-RATE", question: "Evidence full-rate capacity for 1,400 ea at Rev F.", dueDate: "2026-10-29", status: "sent", createdAt: T0, sentAt: T0, sentVia: "email", reply: null },
      { id: "R-3", ref: "REQ-0003", caseId: "C-NI", supplierId: "S-ORION", evidenceId: "E-NI-BRIDGE", question: "Provide a transparent cost bridge for the +7.8% request.", dueDate: "2026-10-22", status: "sent", createdAt: T0, sentAt: T0, sentVia: "email", reply: null },
    ],
    actions: [
      seedAction("T-101", "T-101", { title: "Recover AMS5599-086 coil supply", caseId: "C-AMS", kind: KIND.EXECUTION, priority: "critical", stage: "investigate", dueDate: "2026-10-17", supplierId: null, completionTest: "Alternate recovery position confirmed", expectedResult: "December requirement covered by an approved supplier" }),
      seedAction("T-102", "T-102", { title: "Get written mill allocation evidence", caseId: "C-AMS", kind: KIND.EVIDENCE, evidenceId: "E-AMS-ALLOC", requestId: "R-1", supplierId: "S-NORTH", priority: "high", stage: "waiting", dueDate: "2026-10-24", completionTest: "Written mill allocation received and assessed", expectedResult: "Written mill allocation received and assessed" }),
      seedAction("T-103", "T-103", { title: "Obtain full-rate production capacity evidence", caseId: "C-MACH", kind: KIND.EVIDENCE, evidenceId: "E-M-RATE", requestId: "R-2", supplierId: "S-KESTREL", owner: "Commodity Manager", priority: "high", stage: "waiting", dueDate: "2026-10-29", completionTest: "Capacity evidence received and assessed", expectedResult: "Capacity evidence received and assessed" }),
      seedAction("T-104", "T-104", { title: "Request a transparent surcharge cost bridge", caseId: "C-NI", kind: KIND.EVIDENCE, evidenceId: "E-NI-BRIDGE", requestId: "R-3", supplierId: "S-ORION", owner: "Commodity Manager", priority: "high", stage: "waiting", dueDate: "2026-10-22", completionTest: "Cost bridge received and assessed", expectedResult: "Cost bridge received and assessed" }),
    ],
    decisions: [
      { id: "D-001", ref: "DEC-0001", caseId: "C-AMS", at: "2026-10-16T16:00:00.000Z", title: "Do not accept the incumbent urgency premium yet", rationale: "Alternative supply evidence exists and mill allocation remains unknown.", decider: { name: "Procurement Director", role: "Procurement Director" }, acknowledged: [], routeSupplierId: null, needsSecondApproval: false, thresholdPence: null, secondApproval: null, snapshot: null },
    ],
    events: [
      { id: "EV-SEED-1", at: T0, actor: SEED_ACTOR, caseId: "C-AMS", type: "Evidence requested", text: "Mill allocation requested from Northstar Metals (REQ-0001); T-102 is waiting externally.", refs: {} },
      { id: "EV-SEED-2", at: T0, actor: SEED_ACTOR, caseId: "C-NI", type: "Evidence requested", text: "Cost bridge requested from Orion Alloy (REQ-0003).", refs: {} },
      { id: "EV-SEED-3", at: T0, actor: SEED_ACTOR, caseId: "C-MACH", type: "Evidence requested", text: "Full-rate capacity evidence requested from Kestrel CNC (REQ-0002).", refs: {} },
    ],
  };
}

/* ================================================================ commands */

const nextRef = (s, key, prefix, width = 4) => {
  s.seq[key] = (s.seq[key] || 0) + 1;
  return `${prefix}${String(s.seq[key]).padStart(width, "0")}`;
};

function validActor(a) {
  return a && text(a.name) && text(a.role) ? { name: text(a.name), role: text(a.role) } : null;
}

/* ------------------------------------------------------------------ people

   BF-9 fixed two supplier lists joined by name by making a Supplier an entity
   with an id. The same bug was still in the authority gate: a second approval
   was accepted when `approver.name.toLowerCase()` differed from the decider's,
   so one person signing as "J Smith" having decided as "Jo Smith" passed, and
   two genuinely different Jo Smiths were wrongly blocked. A name is not a
   person.

   People are therefore entities here too, and the gate compares ids. Release A
   has no accounts, so this is not verification — anybody can pick anybody from
   the list. What it removes is the accident: the same person choosing
   themselves is caught, and two different people with one name are two rows.
   The decision records which it was, and the screen says it is self-asserted. */

/** A name reduced to what two spellings of it have in common. */
const nameKey = (s) => text(s).toLowerCase().replace(/\s+/g, " ");

/**
 * Could these two typed names be the same person?
 *
 * The id comparison below catches somebody picking themselves from the list.
 * It cannot catch somebody *typing* a variant of their own name, because a new
 * spelling is a new person to any registry. So a typed approval is also held
 * against this: same surname, and first names that are each other's initial or
 * prefix. "Jo Reid" and "J Reid" are refused; "Jo Reid" and "Alex Morgan" are
 * not.
 *
 * It will refuse two genuinely different people who are "J Reid" and "Jo Reid".
 * That is the right way round — the escape is to pick the approver from the
 * people the workspace already knows, which skips this entirely — and it is
 * still not verification. Nothing here can be, without accounts.
 */
function couldBeSamePerson(a, b) {
  const parts = (s) => nameKey(s).split(" ").filter(Boolean);
  const x = parts(a), y = parts(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  if (x[x.length - 1] !== y[y.length - 1]) return false;      // different surname
  const fx = x[0], fy = y[0];
  return fx === fy || fx.startsWith(fy) || fy.startsWith(fx); // Jo / J / Jo.
}

export const personById = (s, id) => (s.people || []).find((p) => p.id === id) || null;

/** The person this actor is, created on first sight. Names are not verified. */
function resolvePerson(s, actor, ctx) {
  if (!Array.isArray(s.people)) s.people = [];
  const key = nameKey(actor.name);
  const found = s.people.find((p) => nameKey(p.name) === key);
  if (found) {
    /* A role can change; the person does not. The latest one is kept so the
       record reads as it was at the time, without splitting the identity. */
    if (found.role !== actor.role) found.role = actor.role;
    return found;
  }
  const p = { id: ctx.id(), name: actor.name, role: actor.role };
  s.people.push(p);
  return p;
}

function newAction(s, ctx, fields) {
  s.seq.action = (s.seq.action || 0) + 1;
  const a = {
    id: ctx.id(), ref: `T-${s.seq.action}`, kind: KIND.EXECUTION, caseId: null, evidenceId: null,
    requestId: null, supplierId: null, owner: "Buyer", priority: "normal", dueDate: null,
    completionTest: "", expectedResult: "", actualResult: "", dependencies: [], authority: "Buyer",
    createdAt: ctx.now, stage: "investigate",
    ...fields,
  };
  a.history = [{ stage: a.stage, at: ctx.now, by: ctx.actor }];
  s.actions.unshift(a);
  return a;
}

function newEvidence(ctx, { title, state, textValue, source, basis = null, material = true, question = false }) {
  return {
    id: ctx.id(), title, material, question,
    versions: [{ v: 1, state, text: textValue, source, basis, recordedAt: ctx.now, recordedBy: ctx.actor, assessment: null }],
  };
}

function moveStage(a, stage, ctx) {
  a.stage = stage;
  a.history.push({ stage, at: ctx.now, by: ctx.actor });
}

function cleanSource(src, fallbackFrom) {
  const s = src || {};
  return {
    kind: text(s.kind) || "document",
    document: text(s.document) || null,
    from: text(s.from) || fallbackFrom || null,
    date: isIsoDate(s.date) ? s.date : null,
  };
}

const HANDLERS = {
  setUser(s, cmd, ctx) {
    const u = validActor(cmd.user);
    need(u, "user", "A name and a role are both needed: they are recorded against everything you do.");
    s.settings.user = u;
    ctx.emit(null, "Workspace user set", `${u.name} (${u.role}) is working in this browser.`);
  },

  setSecondApprovalThreshold(s, cmd, ctx) {
    need(Number.isInteger(cmd.pence) && cmd.pence > 0, "threshold", "The threshold must be a positive amount.");
    s.settings.secondApprovalAbovePence = cmd.pence;
    ctx.emit(null, "Authority threshold changed", `Decisions on cases above ${formatPence(cmd.pence)} now need a second approver.`);
  },

  addSupplier(s, cmd, ctx) {
    const name = text(cmd.name);
    need(name, "name", "A supplier needs a name.");
    need(!s.suppliers.some((x) => x.name.toLowerCase() === name.toLowerCase()), "duplicate",
      `${name} is already a supplier here. Link the existing one instead of creating a second.`);
    const sup = { id: ctx.id(), name, category: text(cmd.category) || "Not set", otdPct: null, qualityPct: null, risk: "Not assessed", relationship: "Not set" };
    s.suppliers.push(sup);
    ctx.emit(null, "Supplier added", name);
    return { supplierId: sup.id };
  },

  createCase(s, cmd, ctx) {
    const type = cmd.caseType;
    need(CASE_TYPES[type], "type", "Choose what kind of case this is.");
    const statement = text(cmd.statement);
    need(statement, "statement", "Describe the problem first.");
    const ref = nextRef(s, "case", "CASE-");
    const def = CASE_TYPES[type];
    const c = {
      id: ctx.id(), ref, type, example: Boolean(cmd.example),
      title: `${cmd.example ? "Example — " : ""}${text(cmd.title) || def.title}`,
      objective: statement,
      requirement: { quantity: Number.isInteger(cmd.quantity) ? cmd.quantity : null, unit: text(cmd.unit) || null, spec: null,
        needBy: isIsoDate(cmd.needBy) ? cmd.needBy : null },
      valuePence: Number.isInteger(cmd.valuePence) ? cmd.valuePence : null,
      intakeAssessment: null, incumbentId: null, concentrationPct: null,
      claim: type === "claim" ? {
        askBp: Number.isInteger(cmd.askBp) ? cmd.askBp : null,
        capBp: Number.isInteger(cmd.capBp) ? cmd.capBp : null,
        annualSpendPence: Number.isInteger(cmd.annualSpendPence) ? cmd.annualSpendPence : null,
        effectiveDate: null,
      } : null,
      quotes: [], outcomes: [],
      evidence: [
        newEvidence(ctx, { title: "What was reported", state: STATE.CLAIM, textValue: statement,
          source: { kind: "person", document: null, from: `${ctx.actor.name} (${ctx.actor.role})`, date: ctx.today }, material: false }),
        ...def.checklist.map((title) => newEvidence(ctx, { title, state: STATE.UNKNOWN,
          textValue: "Not yet obtained.", source: { kind: "checklist", document: null, from: `${def.label} checklist`, date: ctx.today },
          material: true, question: true })),
      ],
    };
    s.cases.unshift(c);
    ctx.emit(c.id, "Case created", `${ref} opened as "${def.label}" from: ${statement}`);
    return { caseId: c.id };
  },

  linkSupplier(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    const sup = supplierById(s, cmd.supplierId);
    need(sup, "supplier", "That supplier does not exist.");
    need(!c.quotes.some((q) => q.supplierId === sup.id), "duplicate", `${sup.name} is already on ${c.ref}.`);
    const q = cmd.quote || {};
    const price = q.unitPricePence;
    c.quotes.push({
      supplierId: sup.id, approval: ["Approved", "Conditional", "Not approved"].includes(q.approval) ? q.approval : "Not approved",
      leadDays: Number.isInteger(q.leadDays) && q.leadDays >= 0 ? q.leadDays : null,
      unitPricePence: Number.isInteger(price) && price >= 0 ? price : null,
      unit: text(q.unit) || c.requirement.unit || null,
    });
    if (cmd.incumbent) c.incumbentId = sup.id;
    ctx.emit(c.id, "Supplier linked", `${sup.name} added to ${c.ref}${cmd.incumbent ? " as the incumbent" : ""}.`);
  },

  addEvidence(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    const title = text(cmd.title);
    need(title, "title", "Evidence needs a title.");
    const state = cmd.state;
    need([STATE.SUPPLIED, STATE.INFERRED, STATE.ASSUMED, STATE.UNKNOWN, STATE.CLAIM].includes(state), "state",
      "Choose what kind of evidence this is. Derived evidence is only ever worked out by code.");
    const body = text(cmd.text);
    need(body || state === STATE.UNKNOWN, "text", "Record what it says.");
    const basis = text(cmd.basis);
    if (state === STATE.ASSUMED) need(basis, "basis", "An assumption needs its basis. Without one it is a guess with better manners.");
    const source = cleanSource(cmd.source);
    if (state === STATE.SUPPLIED) need(source.document || source.from, "source", "Supplied evidence needs a source you could point somebody to.");
    const e = newEvidence(ctx, { title, state, textValue: body || "Not yet obtained.", source, basis: basis || null,
      material: cmd.material !== false, question: state === STATE.UNKNOWN });
    c.evidence.push(e);
    let action = null;
    if (state === STATE.UNKNOWN) {
      action = newAction(s, ctx, { title: `Close evidence gap: ${title}`, caseId: c.id, kind: KIND.EVIDENCE,
        evidenceId: e.id, owner: ctx.actor.role, priority: "high", dueDate: addDays(ctx.today, 2),
        completionTest: `${title} received and assessed`, expectedResult: `${title} received and assessed` });
    }
    ctx.emit(c.id, "Evidence added", `${title}: ${STATUS_SAID[evidenceStatus(e)]}${action ? `; linked action ${action.ref}` : ""}.`);
    return { evidenceId: e.id, actionId: action?.id || null };
  },

  createWorkForGaps(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    const covered = new Set(openActions(s, c.id).map((a) => a.evidenceId).filter(Boolean));
    const created = [];
    for (const e of openGaps(c)) {
      if (covered.has(e.id)) continue;
      const a = newAction(s, ctx, { title: `Close evidence gap: ${e.title}`, caseId: c.id, kind: KIND.EVIDENCE,
        evidenceId: e.id, owner: ctx.actor.role, priority: "high", dueDate: addDays(ctx.today, 2),
        completionTest: `${e.title} received and assessed`, expectedResult: `${e.title} received and assessed` });
      created.push(a.ref);
    }
    ctx.emit(c.id, "Work created", created.length ? `Actions ${created.join(", ")} cover the open gaps.` : "Every open gap already has an action.");
    return { created: created.length };
  },

  requestEvidence(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "A supplier request must belong to a Procurement Case.");
    const sup = supplierById(s, cmd.supplierId);
    need(sup, "supplier", "Choose the supplier the request goes to.");
    need(c.quotes.some((q) => q.supplierId === sup.id), "not-linked", `Link ${sup.name} to ${c.ref} first.`);
    const question = text(cmd.question);
    need(question, "question", "Say what you are asking for.");
    need(isIsoDate(cmd.dueDate), "due", "A response date is needed, as a date.");
    let e = cmd.evidenceId ? c.evidence.find((x) => x.id === cmd.evidenceId) : null;
    if (cmd.evidenceId) need(e && OPEN.has(evidenceStatus(e)), "evidence", "That evidence is not an open gap.");
    if (!e) {
      e = newEvidence(ctx, { title: text(cmd.title) || question, state: STATE.UNKNOWN,
        textValue: `Requested from ${sup.name}; no reply yet.`, source: { kind: "request", document: null, from: sup.name, date: ctx.today },
        material: cmd.material !== false, question: true });
      c.evidence.push(e);
    }
    const ref = nextRef(s, "request", "REQ-");
    const r = { id: ctx.id(), ref, caseId: c.id, supplierId: sup.id, evidenceId: e.id, question, dueDate: cmd.dueDate,
      status: "draft", createdAt: ctx.now, sentAt: null, sentVia: null, reply: null };
    s.requests.unshift(r);
    let a = openActions(s, c.id).find((x) => x.evidenceId === e.id);
    if (a) { a.requestId = r.id; a.supplierId = sup.id; a.dueDate = cmd.dueDate; if (a.stage === "investigate") moveStage(a, "prepare", ctx); }
    else {
      a = newAction(s, ctx, { title: `${sup.name}: ${question}`, caseId: c.id, kind: KIND.EVIDENCE, evidenceId: e.id,
        requestId: r.id, supplierId: sup.id, owner: ctx.actor.role, priority: "high", stage: "prepare", dueDate: cmd.dueDate,
        completionTest: "Reply received and assessed", expectedResult: "Reply received and assessed" });
    }
    ctx.emit(c.id, "Evidence requested", `${ref} to ${sup.name}: ${question} Due ${formatDate(cmd.dueDate)}. Gap "${e.title}" ↔ ${a.ref}. Not sent yet.`);
    return { requestId: r.id, evidenceId: e.id, actionId: a.id };
  },

  markRequestSent(s, cmd, ctx) {
    const r = requestById(s, cmd.requestId);
    need(r, "request", "That request does not exist.");
    need(r.status === "draft", "state", `${r.ref} has already been sent.`);
    r.status = "sent"; r.sentAt = ctx.now; r.sentVia = text(cmd.via) || "email";
    const a = s.actions.find((x) => x.requestId === r.id && x.stage !== "closed");
    if (a && a.stage !== "waiting") moveStage(a, "waiting", ctx);
    ctx.emit(r.caseId, "Request sent", `${r.ref} sent to ${supplierById(s, r.supplierId)?.name} by ${r.sentVia}. BuyrWorld did not send it; this records that you did.`);
  },

  receiveEvidence(s, cmd, ctx) {
    const { c, e } = evidenceById(s, cmd.evidenceId);
    need(e, "evidence", "That evidence does not exist.");
    need(e.question, "not-a-question", "Only an open question can receive an answer. Add new evidence instead.");
    need(OPEN.has(evidenceStatus(e)), "not-open", `${e.title} is not waiting for an answer.`);
    const body = text(cmd.text);
    need(body, "text", "Record what was actually received, in its own words — not the conclusion you hoped for.");
    const source = cleanSource(cmd.source);
    need(source.document || source.from, "source", "Say where it came from: the document, or who sent it.");
    const prev = current(e);
    e.versions.push({ v: prev.v + 1, state: STATE.SUPPLIED, text: body, source, basis: null,
      recordedAt: ctx.now, recordedBy: ctx.actor, assessment: null });
    const r = s.requests.find((x) => x.evidenceId === e.id && x.status !== "answered");
    if (r) { r.status = "answered"; r.reply = { text: body, receivedAt: ctx.now, from: source.from, document: source.document }; }
    const a = s.actions.find((x) => x.evidenceId === e.id && x.stage !== "closed");
    if (a) { moveStage(a, "validate", ctx); a.actualResult = body; }
    ctx.emit(c.id, "Evidence received", `${e.title}: reply recorded from ${source.from || source.document}. Not yet assessed, so the gap stays open.`);
  },

  assessEvidence(s, cmd, ctx) {
    const { c, e } = evidenceById(s, cmd.evidenceId);
    need(e, "evidence", "That evidence does not exist.");
    need(evidenceStatus(e) === "awaiting", "not-awaiting", `${e.title} has nothing waiting to be assessed.`);
    need(Object.values(VERDICT).includes(cmd.verdict), "verdict", "Choose supports, contradicts or not enough to judge.");
    const note = text(cmd.note);
    need(note, "note", "Say why, in a sentence. It is what the next person reads.");
    const before = caseRisk(s, c, ctx.today).level;
    current(e).assessment = { verdict: cmd.verdict, note, by: ctx.actor, at: ctx.now };
    const a = s.actions.find((x) => x.evidenceId === e.id && x.stage !== "closed");
    if (cmd.verdict === VERDICT.INSUFFICIENT && a) moveStage(a, "waiting", ctx);
    const after = caseRisk(s, c, ctx.today).level;
    ctx.emit(c.id, "Evidence assessed", `${e.title}: ${VERDICT_SAID[cmd.verdict].toLowerCase()} — ${note} Risk ${before} → ${after}.`);
    return { before, after };
  },

  addAction(s, cmd, ctx) {
    const title = text(cmd.title);
    need(title, "title", "Say what needs doing.");
    const c = cmd.caseId ? caseById(s, cmd.caseId) : null;
    if (cmd.caseId) need(c, "case", "That case does not exist.");
    need(isIsoDate(cmd.dueDate), "due", "A due date is needed, as a date.");
    for (const dep of cmd.dependencies || []) need(actionById(s, dep), "dependency", "A dependency names an action that does not exist.");
    const a = newAction(s, ctx, {
      title, caseId: c?.id || null, kind: c ? KIND.EXECUTION : KIND.WORKSPACE,
      owner: text(cmd.owner) || ctx.actor.role, dueDate: cmd.dueDate, priority: cmd.priority || "normal",
      completionTest: text(cmd.completionTest) || "Outcome validated", expectedResult: text(cmd.completionTest) || "Outcome validated",
      dependencies: [...(cmd.dependencies || [])],
    });
    if (c) ctx.emit(c.id, "Action created", `${a.ref}: ${title}`);
    else ctx.emit(null, "Workspace action created", `${a.ref}: ${title} (no Procurement Case)`);
    return { actionId: a.id };
  },

  advanceAction(s, cmd, ctx) {
    const a = actionById(s, cmd.actionId);
    need(a, "action", "That action does not exist.");
    const path = LIFECYCLE[a.kind];
    const i = path.indexOf(a.stage);
    need(i >= 0 && i < path.length - 2, "final", "Validate is the last stage before closing. Use Validate & close.");
    const next = path[i + 1];
    if (a.kind === KIND.EVIDENCE) {
      need(next !== "validate", "waiting", "This action moves on when the evidence arrives. Record it with \"Evidence received\".");
    }
    const unresolved = a.dependencies.filter((id) => actionById(s, id)?.stage !== "closed");
    need(!unresolved.length, "dependency", `Close ${unresolved.map((id) => actionById(s, id)?.ref || id).join(", ")} first.`);
    const c = a.caseId ? caseById(s, a.caseId) : null;
    if (c && (next === "decision" || next === "execute")) {
      const gaps = openGaps(c);
      need(!gaps.length, "gaps", `${c.ref} has ${gaps.length} open material gap${gaps.length > 1 ? "s" : ""} (${gaps.map((e) => e.title).join(", ")}).`);
    }
    if (c && next === "execute") {
      need(authorisingDecision(s, c), "decision", `${c.ref} has no decision that authorises execution. Record one — or re-confirm a stale one — first.`);
    }
    const from = a.stage;
    moveStage(a, next, ctx);
    ctx.emit(a.caseId, "Action progressed", `${a.ref}: ${STAGE_LABEL[from]} → ${STAGE_LABEL[next]}`);
  },

  closeAction(s, cmd, ctx) {
    const a = actionById(s, cmd.actionId);
    need(a, "action", "That action does not exist.");
    need(a.stage === "validate", "stage", `${a.ref} is at ${STAGE_LABEL[a.stage]}. Only work that has reached Validate can be closed.`);
    if (a.evidenceId) {
      const { e } = evidenceById(s, a.evidenceId);
      need(e && !OPEN.has(evidenceStatus(e)), "evidence", "Assess the evidence before closing the action that fetched it.");
    }
    const result = text(cmd.actualResult) || a.actualResult;
    need(result, "result", "Record what actually happened.");
    a.actualResult = result;
    moveStage(a, "closed", ctx);
    ctx.emit(a.caseId, "Action validated", `${a.ref} closed. Actual result: ${result}`);
  },

  /**
   * Record what is at stake on a case.
   *
   * Separate from createCase because the value is often not known at intake —
   * somebody describes a problem before anybody has priced it. Without this
   * the decision gate below would strand such a case permanently: refused for
   * a missing value, with nowhere to supply one.
   */
  setCaseValue(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    need(Number.isInteger(cmd.valuePence) && cmd.valuePence > 0, "value",
      "What is at stake has to be an amount in pounds.");
    const was = c.valuePence;
    c.valuePence = cmd.valuePence;
    const threshold = s.settings.secondApprovalAbovePence;
    const over = Number.isInteger(threshold) && cmd.valuePence > threshold;
    ctx.emit(c.id, was === null ? "Value recorded" : "Value changed",
      `${c.ref} is worth ${formatPence(cmd.valuePence)}${was === null ? "" : ` (was ${formatPence(was)})`}. `
      + (over ? `Above ${formatPence(threshold)}, so a decision will need a second approver.`
              : `At or below ${formatPence(threshold)}, so one decider can authorise it.`));
  },

  recordDecision(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    const decider = validActor(cmd.decider);
    need(decider, "decider", "A decision needs the name and role of the person taking it.");
    const title = text(cmd.title), rationale = text(cmd.rationale);
    need(title && rationale, "words", "Say what was decided and why.");
    const gaps = openGaps(c);
    need(!gaps.length, "gaps", `Close ${gaps.map((e) => e.title).join(", ")} before deciding. A decision cannot rest on an unknown.`);
    /* Before anything else about authority: the threshold is applied to the
       case value, so an unrecorded value silently answers "no second approver
       needed" for a case of any size. Refused rather than defaulted — the
       same rule as every other missing number here. */
    need(Number.isInteger(c.valuePence), "value",
      "Record what is at stake on this case before deciding. The approval threshold cannot be applied to an unknown, "
      + "so a decision taken now could not say whether it needed a second approver.");
    const ack = new Set(cmd.acknowledged || []);
    const missing = toAcknowledge(c).filter((e) => !ack.has(e.id));
    need(!missing.length, "acknowledge",
      `This decision would rest on ${missing.map((e) => `${e.title} (${STATUS_SAID[evidenceStatus(e)].toLowerCase()})`).join(", ")}. Acknowledge each by name.`);
    if (cmd.routeSupplierId) need(c.quotes.some((q) => q.supplierId === cmd.routeSupplierId), "route", "The chosen supplier is not on this case.");
    const threshold = s.settings.secondApprovalAbovePence;
    const needsSecond = Number.isInteger(c.valuePence) && Number.isInteger(threshold) && c.valuePence > threshold;
    const ref = nextRef(s, "decision", "DEC-");
    const deciderPerson = resolvePerson(s, decider, ctx);
    const d = {
      id: ctx.id(), ref, caseId: c.id, at: ctx.now, title, rationale, decider,
      deciderPersonId: deciderPerson.id,
      recordedBy: ctx.actor, acknowledged: [...ack].filter((id) => c.evidence.some((e) => e.id === id)),
      routeSupplierId: cmd.routeSupplierId || null,
      needsSecondApproval: needsSecond, thresholdPence: needsSecond ? threshold : null, secondApproval: null,
      snapshot: snapshotFor(s, c, ctx.today),
    };
    s.decisions.unshift(d);
    ctx.emit(c.id, "Decision recorded",
      `${ref} by ${decider.name} (${decider.role}): ${title}. ${d.snapshot.evidence.length} evidence items frozen; risk ${d.snapshot.risk.level}.${needsSecond ? ` Needs a second approver (value above ${formatPence(threshold)}).` : ""}`);
    return { decisionId: d.id };
  },

  approveDecision(s, cmd, ctx) {
    const d = decisionById(s, cmd.decisionId);
    need(d, "decision", "That decision does not exist.");
    need(d.needsSecondApproval && !d.secondApproval, "state", "That decision is not waiting for approval.");
    need(decisionStatus(s, { ...d, secondApproval: { pending: true } }).status !== "stale", "stale",
      "The evidence has changed since this decision. Record a new one instead of approving it.");
    /* By id where the approver was picked from the people already known, by
       name where they are new. Either way the comparison below is between
       people rather than between spellings. */
    const picked = cmd.approverPersonId ? personById(s, cmd.approverPersonId) : null;
    need(!cmd.approverPersonId || picked, "approver", "That person is not on this workspace.");
    const approver = picked ? { name: picked.name, role: picked.role } : validActor(cmd.approver);
    need(approver, "approver", "The approver's name and role are needed.");

    const approverPerson = picked || resolvePerson(s, approver, ctx);
    const decider = d.deciderPersonId
      ? personById(s, d.deciderPersonId)
      : (s.people || []).find((p) => nameKey(p.name) === nameKey(d.decider.name)) || null;
    need(!decider || approverPerson.id !== decider.id, "same-person",
      `A second approval has to come from a second person. ${d.decider.name} took this decision.`);
    /* Typed, not picked: also held against the decider's name, because a
       variant spelling is a new person to the registry and so passes the test
       above. Picking from the list is the way round it, deliberately. */
    need(picked || !couldBeSamePerson(approver.name, d.decider.name), "same-person",
      `“${approver.name}” could be another way of writing “${d.decider.name}”, who took this decision. `
      + `If they really are two people, choose the approver from the people this workspace already knows.`);

    d.secondApproval = {
      by: approver, personId: approverPerson.id, at: ctx.now,
      /* Said in the record, not only on screen: Release A has no accounts, so
         this is a name somebody chose, not an identity anybody checked. */
      asserted: true,
    };
    ctx.emit(d.caseId, "Decision approved",
      `${d.ref} approved by ${approver.name} (${approver.role}), who is not ${d.decider.name}. Names are self-asserted in this build.`);
  },

  recordOutcome(s, cmd, ctx) {
    const c = caseById(s, cmd.caseId);
    need(c, "case", "That case does not exist.");
    const d = decisionById(s, cmd.decisionId);
    need(d && d.caseId === c.id, "decision", "Name the decision this outcome validates.");
    need(decisionStatus(s, d).status === "authorising", "decision-state", `${d.ref} does not authorise execution: ${decisionStatus(s, d).said}`);
    need(!openGaps(c).length, "gaps", "Material evidence gaps are still open.");
    need(!openActions(s, c.id).length, "open-work", `Close ${openActions(s, c.id).map((a) => a.ref).join(", ")} first.`);
    need(executedAfter(s, c, d), "not-executed", `No action on ${c.ref} was executed after ${d.ref}. An outcome validates execution; it cannot replace it.`);
    const result = text(cmd.result), validation = text(cmd.validation);
    need(result && validation, "words", "Say what happened and how it was checked.");
    const by = validActor(cmd.validatedBy);
    need(by, "validator", "The name and role of whoever validated it are needed.");
    const ref = nextRef(s, "outcome", "OUT-");
    c.outcomes.unshift({ id: ctx.id(), ref, at: ctx.now, decisionId: d.id, decisionRef: d.ref, result, validation, validatedBy: by, lessons: text(cmd.lessons) });
    ctx.emit(c.id, "Outcome recorded", `${ref} validates ${d.ref}: ${result} (checked by ${validation}).`);
    return { outcomeRef: ref };
  },
};

export const COMMANDS = Object.freeze(Object.keys(HANDLERS));

/**
 * The only way state changes.
 *
 * Returns a new state and the events the change produced; the state passed in
 * is never touched. A refusal throws `Refusal` with a code and a sentence a
 * person can act on, and nothing changes.
 */
export function apply(state, command, actor, { now = new Date().toISOString(), today = localToday(), id = uuid } = {}) {
  need(command && HANDLERS[command.type], "command", `Unknown command: ${command?.type}`);
  const who = validActor(actor);
  need(who, "actor", "Every change is recorded against a person: a name and a role are needed.");
  need(typeof now === "string" && /^\d{4}-\d{2}-\d{2}T/.test(now), "clock", "The time of the change is not known.");
  const s = structuredClone(state);
  const events = [];
  const ctx = {
    now, today, id, actor: who,
    emit(caseId, type, text) {
      const ev = { id: id(), at: now, actor: who, caseId: caseId || null, type, text, refs: { command: command.type } };
      s.events.unshift(ev);
      events.push(ev);
    },
  };
  const result = HANDLERS[command.type](s, command, ctx) || {};
  s.rev = (s.rev || 0) + 1;
  return { state: s, events, result };
}

/* ======================================================= persistence formats */

/**
 * Bring stored data up to the current schema without losing it.
 *
 * v2 (v0.3–v0.7) stored dates as "17 Oct" with no year. They are kept as they
 * were written, marked as such, and given the migration time as the only
 * timestamp that can honestly be attached.
 */
export function migrate(raw, { now = new Date().toISOString(), id = uuid } = {}) {
  if (!raw || typeof raw !== "object") return { state: seedState(), from: null };
  if (raw.schema === SCHEMA) return { state: raw, from: SCHEMA };
  if (raw.schema !== 2) return { state: seedState(), from: raw.schema ?? "unknown", discarded: true };

  const seed = seedState();
  const legacy = (d) => ({ legacyDate: d || null, migratedAt: now });
  const supplierByName = new Map(seed.suppliers.map((x) => [x.name, x]));
  const suppliers = [...seed.suppliers];
  const ensureSupplier = (name) => {
    if (!name) return null;
    if (supplierByName.has(name)) return supplierByName.get(name).id;
    const sup = { id: id(), name, category: "Not set", otdPct: null, qualityPct: null, risk: "Not assessed", relationship: "Not set" };
    supplierByName.set(name, sup); suppliers.push(sup);
    return sup.id;
  };
  for (const sp of raw.suppliers || []) ensureSupplier(sp.name);

  const MIGRATED = { name: "Migrated from v0.7", role: "System" };
  const cases = (raw.cases || []).map((c) => {
    const quotes = (c.suppliers || []).map((q) => ({
      supplierId: ensureSupplier(q.name), approval: q.approval || "Not approved",
      leadDays: Number.isInteger(q.lead) ? q.lead : null,
      unitPricePence: typeof q.price === "number" ? parseMoneyToPence(String(q.price)) : null, unit: null,
    }));
    return {
      id: c.id, ref: c.ref, type: c.stage === "Negotiation" ? "claim" : c.stage === "Recovery" ? "shortage" : "sourcing",
      example: false, title: c.title, objective: c.objective,
      requirement: { quantity: null, unit: null, spec: c.requirement || null, needBy: null },
      valuePence: Number.isInteger(c.value) && c.value > 0 ? c.value * 100 : null,
      intakeAssessment: c.baseRisk || null, incumbentId: null, concentrationPct: null, claim: null,
      quotes, outcomes: (c.outcomes || []).map((o) => ({ id: o.id || id(), ref: o.id, at: now, decisionId: null, decisionRef: "an unrecorded decision", result: o.result, validation: o.validation, validatedBy: { name: o.owner || "User", role: "Not recorded" }, lessons: o.lessons || "", ...legacy(o.date) })),
      evidence: (c.evidence || []).map((e) => ({
        id: e.id, title: e.title, material: e.state === "UNKNOWN" || e.state === "INFERRED", question: e.state === "UNKNOWN",
        versions: [{ v: 1, state: e.state === "KNOWN" ? STATE.SUPPLIED : (STATE[e.state] || STATE.CLAIM), text: e.detail || "", basis: null,
          source: { kind: "document", document: e.provenance?.ref || e.source || null, from: null, date: null },
          recordedAt: now, recordedBy: MIGRATED, assessment: null, ...legacy(e.updated || e.provenance?.captured) }],
      })),
    };
  });
  const stageMap = { investigate: "investigate", prepare: "prepare", waiting: "waiting", decision: "decision", execute: "execute", validate: "validate", closed: "closed" };
  let n = 100;
  const actions = (raw.tasks || []).map((t) => {
    n += 1;
    const kind = t.evidenceId ? KIND.EVIDENCE : t.caseId ? KIND.EXECUTION : KIND.WORKSPACE;
    let stage = stageMap[t.stage] || "investigate";
    if (!LIFECYCLE[kind].includes(stage)) stage = kind === KIND.EVIDENCE ? "waiting" : "investigate";
    return {
      id: id(), ref: `T-${n}`, legacyId: t.id, kind, caseId: t.caseId || null, evidenceId: t.evidenceId || null, requestId: null,
      supplierId: ensureSupplier(t.supplier), title: t.title, owner: t.owner || "Buyer", priority: t.priority || "normal",
      dueDate: null, legacyDue: t.due || null, completionTest: t.completion || "", expectedResult: t.expectedResult || t.completion || "",
      actualResult: t.actualResult || "", dependencies: [], authority: t.authority || "Buyer", createdAt: now, stage,
      history: [{ stage, at: now, by: MIGRATED }],
    };
  });
  const decisions = (raw.decisions || []).map((d) => ({
    id: d.id, ref: d.id, caseId: d.caseId, at: now, title: d.title, rationale: d.reason || "",
    decider: { name: d.owner || "User", role: "Not recorded" }, acknowledged: [], routeSupplierId: null,
    needsSecondApproval: false, thresholdPence: null, secondApproval: null, snapshot: null, ...legacy(d.date),
  }));
  const events = (raw.events || []).map((e) => ({ id: id(), at: now, actor: MIGRATED, caseId: e.caseId || null, type: e.type, text: e.text, refs: {}, ...legacy(e.date) }));
  events.unshift({ id: id(), at: now, actor: MIGRATED, caseId: null, type: "Workspace migrated",
    text: "Data from v0.7 was kept. Its dates had no year, so each is shown as originally written; decisions from then cannot authorise execution because they have no evidence snapshot.", refs: {} });
  return {
    from: 2,
    state: {
      schema: SCHEMA, rev: 0, seq: { case: cases.length, action: n, request: 0, decision: decisions.length, outcome: 0 },
      settings: { user: null, secondApprovalAbovePence: 25_000_000 },
      suppliers, cases, requests: [], actions, decisions, events,
    },
  };
}

/** A workspace file someone exported, checked before it replaces anything. */
export function validateImport(obj) {
  const problems = [];
  if (!obj || typeof obj !== "object") return ["The file is not a BuyrFlow workspace."];
  if (obj.schema !== SCHEMA && obj.schema !== 2) problems.push(`It is schema ${obj.schema}; this build reads 2 and ${SCHEMA}.`);
  for (const k of ["cases", "suppliers"]) if (!Array.isArray(obj[k])) problems.push(`It has no ${k} list.`);
  if (obj.schema === SCHEMA) for (const k of ["actions", "decisions", "events", "requests"]) if (!Array.isArray(obj[k])) problems.push(`It has no ${k} list.`);
  return problems;
}

/** Headline numbers for the Today page. */
export function workspaceMetrics(s, today) {
  const risks = s.cases.map((c) => caseRisk(s, c, today).level);
  return {
    critical: risks.filter((r) => r === "Critical").length,
    high: risks.filter((r) => r === "High").length,
    openActions: s.actions.filter((a) => a.stage !== "closed").length,
    overdue: s.actions.filter((a) => a.stage !== "closed" && isIsoDate(a.dueDate) && a.dueDate < today).length,
    readyToDecide: s.cases.filter((c) => ["decision", "approval"].includes(casePhase(s, c).id)).length,
    awaitingAssessment: s.cases.reduce((n, c) => n + c.evidence.filter((e) => evidenceStatus(e) === "awaiting").length, 0),
  };
}
