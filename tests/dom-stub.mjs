/**
 * Just enough browser to import app.js.
 *
 * app.js owns storage, routing and the dialogs, and until now none of it had
 * a test: views.js is pure and could be rendered, but the layer that decides
 * *which workspace is on screen and where it is saved* could only be read.
 * That is the layer where a mistake loses somebody's real cases.
 *
 * This is deliberately not a DOM. It is a flat registry of the handful of
 * elements the shell declares, with innerHTML kept as a string. That is
 * enough for app.js to boot, render, switch workspace and save — and it is
 * honest about what it cannot see: layout, focus, events reaching a real
 * button, or anything about how a page looks. A test using this proves
 * behaviour, never appearance.
 */

class Stub {
  constructor(sel, attrs = {}) {
    this.sel = sel;
    this.innerHTML = "";
    this.hidden = false;
    this.open = false;
    this.value = "";
    this.tabIndex = 0;
    this.dataset = { ...attrs };
    this.attributes = {};
    this.classes = new Set();
    this.children = [];
    this.listeners = {};
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  appendChild(el) { this.children.push(el); return el; }
  remove() {}
  focus() {}
  scrollIntoView() {}
  querySelector() { return null; }
  get classList() {
    const s = this.classes;
    return {
      add: (c) => s.add(c), remove: (c) => s.delete(c),
      contains: (c) => s.has(c),
      toggle: (c, on) => (on === undefined ? (s.has(c) ? s.delete(c) : s.add(c)) : on ? s.add(c) : s.delete(c)),
    };
  }
}

/** The elements public/index.html declares, as app.js looks them up. */
function shell() {
  const el = (sel, attrs) => [sel, new Stub(sel, attrs)];
  return new Map([
    el("#app"), el("#banner"), el("#toast-region"), el("#alert-region"),
    el("#sidebar"), el("#menu"), el("#help"), el("#global-search"),
    el("#workspace-more"), el("#solve-input"), el(".app-shell"),
  ]);
}

/**
 * Install the stub globals and return a handle on them.
 * Call before importing app.js; the import is cached, so one per process.
 */
export function installDOM({ path = "/", search = "", hash = "" } = {}) {
  const els = shell();
  const store = new Map();
  const toasts = [];
  const switches = [
    new Stub('[data-workspace="demo"]', { workspace: "demo" }),
    new Stub('[data-workspace="live"]', { workspace: "live" }),
  ];
  const navs = ["today", "flow", "cases", "suppliers", "decisions"].map((n) => new Stub(`[data-nav=${n}]`, { nav: n }));

  const find = (sel) => {
    if (els.has(sel)) return els.get(sel);
    if (sel.startsWith("#") || sel.startsWith(".")) return null;
    return null;
  };
  const findAll = (sel) => {
    if (sel === "[data-workspace]") return switches;
    if (sel === "[data-nav]") return navs;
    if (sel === "#sidebar a") return [];
    if (sel === ".hint-slot") return [];
    return [];
  };

  const body = new Stub("body");
  const doc = {
    title: "",
    body,
    activeElement: null,
    listeners: {},
    querySelector: find,
    querySelectorAll: findAll,
    getElementById: (id) => find(`#${id}`),
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    createElement: (tag) => new Stub(`<${tag}>`),
    contains: () => false,
  };

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
  };

  globalThis.document = doc;
  globalThis.localStorage = localStorage;
  globalThis.location = { pathname: path, search, hash, href: `http://localhost${path}${search}${hash}`, reload() {} };
  globalThis.history = { pushState() {}, replaceState() {} };
  globalThis.window = {
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    location: globalThis.location,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.CSS = { escape: (s) => String(s).replace(/[^\w-]/g, "\\$&") };
  globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
  globalThis.URL.createObjectURL ||= () => "blob:stub";
  globalThis.URL.revokeObjectURL ||= () => {};

  /* Toasts are appended to a region; read them back to see what was said. */
  const region = els.get("#toast-region");
  const alertRegion = els.get("#alert-region");
  const texts = (r) => r.children.map((c) => c.textContent ?? "");
  for (const r of [region, alertRegion]) {
    const orig = r.appendChild.bind(r);
    r.appendChild = (el) => { toasts.push(el); return orig(el); };
  }

  return {
    store,
    doc,
    body,
    switches,
    /** Everything a toast has said since the last read. */
    said: () => toasts.map((t) => t.textContent || "").filter(Boolean),
    clearSaid: () => { toasts.length = 0; },
    html: () => els.get("#app").innerHTML,
    banner: () => (els.get("#banner").hidden ? "" : els.get("#banner").innerHTML),
    workspace: () => body.dataset.workspace,
    pressed: () => Object.fromEntries(switches.map((s) => [s.dataset.workspace, s.getAttribute("aria-pressed")])),
    /** Fire a document-level click the way the real delegated handler would. */
    click(action, data = {}) {
      const target = new Stub(`[data-action=${action}]`, { action, ...data });
      target.closest = (sel) => (sel === "[data-action]" ? target : null);
      for (const fn of doc.listeners.click || []) fn({ target, preventDefault() {} });
    },
    /** Fire the cross-tab storage event. */
    storage(key) {
      for (const fn of globalThis.window.listeners.storage || []) fn({ key });
    },
    unused: texts,
  };
}
