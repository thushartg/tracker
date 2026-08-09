'use strict';

/* ============================================================== constants */

const HOUSES = ['targaryen', 'stark', 'lannister', 'tyrell', 'greyjoy', 'martell', 'arryn'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DATA_REPO = 'tracker-data';
const FLUSH_MS = 30000;

/* How far back the per-task history will page. Bounds the number of month
   files a curious click can pull, and stops paging into empty prehistory. */
const HISTORY_MONTHS = 12;

const K = {
  tasks: 'ledger.tasks',
  log:   'ledger.log',
  dirty: 'ledger.dirty',
  owner: 'ledger.owner',
  token: 'ledger.token',
  hidden: 'ledger.syncHidden',
  months: 'ledger.months'
};

/* Hand-drawn single-stroke sigils. 24x24, stroke inherits the house accent. */
const ICONS = {
  run:    '<circle cx="14.6" cy="4.7" r="1.7"/><path d="M13.2 8.4 9.4 10.7 7.4 14"/><path d="m13.2 8.4 3.2 2.2 1 3.3"/><path d="m13.2 8.4-1.5 4.6 2.7 2.4-1 4.7"/><path d="M11.7 13 8.1 16.1l-3.5.7"/>',
  flame:  '<path d="M12 3.2c2.4 3.1 4.6 4.9 4.6 8.2a4.6 4.6 0 0 1-9.2 0c0-1.8.8-3.1 1.9-4.4.3 1.5 1 2.1 1.7 2.3-.6-2.2-.4-4.3 1-6.1Z"/>',
  book:   '<path d="M12 6.6C10.4 5.2 8 4.6 4.6 4.9v12.4c3.4-.3 5.8.3 7.4 1.8 1.6-1.5 4-2.1 7.4-1.8V4.9c-3.4-.3-5.8.3-7.4 1.7Z"/><path d="M12 6.6v12.5"/>',
  quill:  '<path d="M5 19.2c4.8.6 8-1 10.4-4 2.2-2.8 2.9-6 3-8.9-3.4 1.1-6.6 1.3-9 2.6-2.9 1.6-4 4.4-2.6 7.2Z"/><path d="M4.3 20.1 9.7 14"/>',
  goblet: '<path d="M7.4 4.6h9.2l-.9 5.1a3.8 3.8 0 0 1-7.4 0Z"/><path d="M12 13.6v5.1"/><path d="M8.6 19.2h6.8"/>',
  blade:  '<path d="M20 4 10.6 13.4"/><path d="m7.4 12.6 4 4"/><path d="M9.4 14.6 5 19"/><path d="m4 20 1.4-1.4"/>',
  moon:   '<path d="M19 14.6A7.6 7.6 0 0 1 9.4 5 7.6 7.6 0 1 0 19 14.6Z"/>',
  sun:    '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M6.2 6.2l1.6 1.6M16.2 16.2l1.6 1.6M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6"/>',
  bowl:   '<path d="M3.6 10.6h16.8a8.4 8.4 0 0 1-16.8 0Z"/><path d="M5.8 19.4h12.4"/><path d="M9.4 7.6c-1-1.4-.6-2.6.6-3.8M13.4 7.6c-1-1.4-.6-2.6.6-3.8"/>',
  shield: '<path d="M12 3.6 5 6v5.6c0 4 2.9 7 7 8.8 4.1-1.8 7-4.8 7-8.8V6Z"/><path d="M12 3.6v16.8"/>',
  tower:  '<path d="M7 20V8l5-4.4L17 8v12Z"/><path d="M10 20v-4.6h4V20"/><path d="M7 8h10"/>',
  key:    '<circle cx="8" cy="8" r="3.6"/><path d="m10.6 10.6 8 8"/><path d="m15.6 15.6 2-2M17.9 17.9l2-2"/>'
};
const ICON_KEYS = Object.keys(ICONS);

/* ==================================================================== dom */

const $  = (sel, root = document) => root.querySelector(sel);
const page = document.body.dataset.page;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function icon(key, cls = '') {
  const body = ICONS[key] || ICONS.shield;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* =================================================================== time */

const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');

/** "06:00" -> 360. Returns null for anything malformed. */
function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const isoWeekday = (d = new Date()) => d.getDay() || 7;           // 1 = Monday
const todayKey   = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local timestamp carrying the offset: 2026-08-07T07:12:00+05:30 */
function isoLocal(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${todayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
         `${sign}${pad(off / 60)}:${pad(Math.abs(off) % 60)}`;
}

/** Windows are wall-clock. end < start wraps past midnight. */
function inWindow(t, m) {
  const s = toMinutes(t.window.start), e = toMinutes(t.window.end);
  return s <= e ? (m >= s && m < e) : (m >= s || m < e);
}
const endsIn   = (t, m) => ((toMinutes(t.window.end)   - m) + 1440) % 1440;
const startsIn = (t, m) => ((toMinutes(t.window.start) - m) + 1440) % 1440;

function fmtDuration(mins) {
  if (mins < 1) return 'under a minute';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const scheduledToday = (t, wd) => !t.days || !t.days.length || t.days.includes(wd);

/* ================================================================== store */

const store = {
  tasks: [],
  log: {},                                  // { 'YYYY-MM-DD': { id: { done, at } } }
  dirty: { tasks: false, months: [] },
  months: {},                               // { 'YYYY-MM': 'loaded' | 'missing' }

  load() {
    this.tasks = (readJSON(K.tasks, { tasks: [] }).tasks || []).map(normalize).filter(Boolean);
    this.log   = readJSON(K.log, {});
    this.dirty = Object.assign({ tasks: false, months: [] }, readJSON(K.dirty, {}));
    this.months = readJSON(K.months, {});
  },
  saveTasks(markDirty = true) {
    localStorage.setItem(K.tasks, JSON.stringify({ tasks: this.tasks }));
    if (markDirty) { this.dirty.tasks = true; this.saveDirty(); }
  },
  saveLog(month) {
    localStorage.setItem(K.log, JSON.stringify(this.log));
    if (month && !this.dirty.months.includes(month)) this.dirty.months.push(month);
    this.saveDirty();
  },
  saveDirty() { localStorage.setItem(K.dirty, JSON.stringify(this.dirty)); },
  saveMonths() { localStorage.setItem(K.months, JSON.stringify(this.months)); },

  /**
   * 'loaded'  — the month file was fetched (or fetched and found absent), so a
   *             scheduled day with no entry really was missed.
   * 'unknown' — never fetched. A day with no entry proves nothing, and must not
   *             be drawn as a miss.
   */
  monthState(month) { return this.months[month] || 'unknown'; },

  doneToday() { return this.log[todayKey()] || {}; },

  complete(id) {
    const day = todayKey();
    (this.log[day] = this.log[day] || {})[id] = { done: true, at: isoLocal() };
    this.saveLog(day.slice(0, 7));
  },

  /**
   * Taking a completion back writes `done: false` — a tombstone, not a delete.
   * `mergeMonth` spreads remote first and local second, so a key removed
   * locally is simply absent from the local side and the remote `done: true`
   * survives the next flush. Only a value can outrank a value.
   */
  uncomplete(id) {
    const day = todayKey();
    const entries = this.log[day];
    if (!entries || !entries[id]) return false;
    entries[id] = { done: false, at: isoLocal() };
    this.saveLog(day.slice(0, 7));
    return true;
  },

  monthSlice(month) {
    const out = {};
    for (const [date, entries] of Object.entries(this.log)) {
      if (date.startsWith(month)) out[date] = entries;
    }
    return out;
  }
};

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

/** Drop anything that would blow up at render time. */
function normalize(t) {
  if (!t || !t.id || !t.label || !t.window) return null;
  if (toMinutes(t.window.start) === null || toMinutes(t.window.end) === null) return null;
  return {
    id: String(t.id),
    label: String(t.label),
    icon: ICONS[t.icon] ? t.icon : 'shield',
    color: HOUSES.includes(t.color) ? t.color : 'stark',
    window: { start: t.window.start, end: t.window.end },
    days: Array.isArray(t.days) ? t.days.filter((d) => d >= 1 && d <= 7) : []
  };
}

/* ================================================================= github */

const cfg = () => ({
  owner: localStorage.getItem(K.owner) || '',
  token: localStorage.getItem(K.token) || ''
});
const hasToken = () => { const c = cfg(); return !!(c.owner && c.token); };

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* Contents API only — raw.githubusercontent.com is CDN-cached and lies. */
function ghFetch(path, init = {}) {
  const c = cfg();
  return fetch(`https://api.github.com/repos/${c.owner}/${DATA_REPO}/contents/${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${c.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {})
    }
  });
}

async function ghRead(path) {
  const res = await ghFetch(path);
  if (res.status === 404) return { data: null, sha: null };
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const meta = await res.json();
  return { data: JSON.parse(b64decode(meta.content)), sha: meta.sha };
}

/** Read → mutate → write with the sha we just read. One replay on conflict. */
async function ghCommit(path, mutate, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await ghRead(path);
    const body = { message, content: b64encode(JSON.stringify(mutate(data), null, 2) + '\n') };
    if (sha) body.sha = sha;
    const res = await ghFetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) return;
    if (res.status !== 409 && res.status !== 422) throw new Error(`PUT ${path} → ${res.status}`);
  }
  throw new Error(`PUT ${path} → conflict after replay`);
}

/* ------------------------------------------------------------ sync loops */

let flushTimer = null;
let flushing = false;

function scheduleFlush() {
  if (!hasToken()) { setStatus('local only'); return; }
  setStatus('pending');
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_MS);
}

async function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (flushing || !hasToken()) return;
  if (!navigator.onLine) { setStatus('offline — will retry'); return; }
  if (!store.dirty.tasks && !store.dirty.months.length) { setStatus('synced'); return; }

  flushing = true;
  setStatus('syncing');
  try {
    if (store.dirty.tasks) {
      await ghCommit('config/tasks.json', () => ({ tasks: store.tasks }), 'update task definitions');
      store.dirty.tasks = false;
      store.saveDirty();
    }
    for (const month of store.dirty.months.slice()) {
      const local = store.monthSlice(month);
      await ghCommit(`data/${month}.json`, (remote) => mergeMonth(remote, local), `log ${month}`);
      store.dirty.months = store.dirty.months.filter((m) => m !== month);
      store.saveDirty();
    }
    setStatus('synced');
  } catch (err) {
    setStatus(`sync failed — ${err.message}`);
  } finally {
    flushing = false;
  }
}

/** Local wins per task-id; remote entries we never saw are preserved. */
function mergeMonth(remote, local) {
  const out = { ...(remote || {}) };
  for (const [date, entries] of Object.entries(local)) out[date] = { ...out[date], ...entries };
  return out;
}

/**
 * Fetch one month file and fold it into the log. Cached by `store.months`, so
 * paging back through history costs one request per month, once.
 *
 * `force` refetches a month we already hold — the current month on every boot,
 * because it is the one still being written to.
 */
const monthsInFlight = new Set();

async function ensureMonth(month, force = false) {
  if (!hasToken()) return false;
  if (!force && store.monthState(month) !== 'unknown') return false;
  if (monthsInFlight.has(month)) return false;

  monthsInFlight.add(month);
  try {
    const { data } = await ghRead(`data/${month}.json`);
    if (data) {
      for (const [date, entries] of Object.entries(data)) {
        store.log[date] = { ...entries, ...store.log[date] };   // local wins
      }
      localStorage.setItem(K.log, JSON.stringify(store.log));
    }
    /* A 404 is an answer: that month has no file, so nothing was logged in it. */
    store.months[month] = data ? 'loaded' : 'missing';
    store.saveMonths();
    return true;
  } finally {
    monthsInFlight.delete(month);
  }
}

async function pull() {
  if (!hasToken()) { setStatus('local only'); return; }
  setStatus('loading');
  try {
    if (!store.dirty.tasks) {
      const { data } = await ghRead('config/tasks.json');
      if (data && Array.isArray(data.tasks)) {
        store.tasks = data.tasks.map(normalize).filter(Boolean);
        store.saveTasks(false);
      }
    }
    await ensureMonth(todayKey().slice(0, 7), true);
    setStatus(store.dirty.months.length || store.dirty.tasks ? 'pending' : 'synced');
    render();
  } catch (err) {
    setStatus(`load failed — ${err.message}`);
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('online', flush);

/* ============================================================== low poly */

/* Original artwork. Flat triangular facets shaded off the task's house accent,
   in the manner of low-poly illustration — a style, not a copy of any picture.
   Nothing here is traced.

   A facet is { s, p }: a shade in 0..1 and a flat list of x,y in a 100x100 box.
   0 is the accent sunk into --ash, 1 is the accent lifted toward --parchment. */

const f = (s, ...p) => ({ s, p });

/** Same, but tagged — consecutive facets sharing a tag become one moving limb. */
const fp = (k, s, ...p) => ({ s, p, k });

/* Light from the upper left, so shading stays consistent across every subject. */
const litBy = (x, y) => Math.max(0, Math.min(1, 0.58 - ((x - 50) / 100 + (y - 50) / 100)));

function facetFill(s) {
  const c = Math.max(0, Math.min(1, s));
  return c <= 0.5
    ? `color-mix(in srgb, var(--accent) ${Math.round(22 + c * 156)}%, var(--ash))`
    : `color-mix(in srgb, var(--accent) ${Math.round(100 - (c - 0.5) * 112)}%, var(--parchment))`;
}

/* --- authored subjects ------------------------------------------------- */

/** Facets fanned from a centre — a faceted disc. */
function ringFacets(cx, cy, r, n, inner, rot = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2, b = rot + ((i + 1) / n) * Math.PI * 2;
    const ax = cx + Math.cos(a) * r, ay = cy + Math.sin(a) * r;
    const bx = cx + Math.cos(b) * r, by = cy + Math.sin(b) * r;
    const ix = cx + Math.cos(a) * inner, iy = cy + Math.sin(a) * inner;
    out.push(f(litBy((ax + bx + ix) / 3, (ay + by + iy) / 3), cx, cy, ax, ay, bx, by));
  }
  return out;
}

/** A faceted band between two radii. The hole is a facet dark enough to read
    as the page showing through, since a polygon cannot be cut. */
function annulus(cx, cy, ro, ri, n, rot = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2, b = rot + ((i + 1) / n) * Math.PI * 2;
    const p = (ang, r) => [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
    const [ax, ay] = p(a, ro), [bx, by] = p(b, ro);
    const [dx, dy] = p(b, ri), [ex, ey] = p(a, ri);
    out.push(f(litBy((ax + bx) / 2, (ay + by) / 2), ax, ay, bx, by, dx, dy, ex, ey));
  }
  return out;
}

const SUBJECTS = {
  sun: () => {
    const core = ringFacets(50, 50, 22, 9, 22);
    const rays = [];
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i / 9) * Math.PI * 2, w = 0.19;
      const p = (ang, r) => [50 + Math.cos(ang) * r, 50 + Math.sin(ang) * r];
      const [x1, y1] = p(a - w, 22), [x2, y2] = p(a + w, 22), [x3, y3] = p(a, 41);
      rays.push(f(litBy(x3, y3) * 0.9 + 0.08, x1, y1, x2, y2, x3, y3));
    }
    return [...rays, ...core];
  },

  moon: () => {
    const out = [], n = 11;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.62 + (i / n) * Math.PI * 1.24;
      const b = -Math.PI * 0.62 + ((i + 1) / n) * Math.PI * 1.24;
      const o = (ang) => [50 + Math.cos(ang) * 34, 50 + Math.sin(ang) * 34];
      const t = (ang) => [58 + Math.cos(ang) * 26, 50 + Math.sin(ang) * 27];
      const [ax, ay] = o(a), [bx, by] = o(b), [cx2, cy2] = t(a), [dx, dy] = t(b);
      out.push(f(litBy(ax, ay), ax, ay, bx, by, dx, dy, cx2, cy2));
    }
    return out;
  },

  /* Mid-stride, facing right. Every joint is a real point — each segment runs
     from its parent joint to its own, at a stated angle and length, so the
     figure articulates instead of being a pile of quads that happen to touch.
     Hips (55,52)/(47,53), shoulders (58,27)/(51,28), knees (47,67)/(55.5,67.7),
     which is exactly where the CSS puts each limb's transform-origin.

     Far limbs come first so the near ones paint over them — the shading says
     which side a limb is on, and the stacking has to agree with it.

     Each shin starts 3 units *above* its knee. Two quads hinged at a shared
     edge tear open a wedge as they fold, and the knee folds 70deg; the overhang
     sweeps round the joint and keeps it covered instead.

     The pose is contralateral with the *near arm forward*, not back. Either
     phase is anatomically fine, but this one keeps the far arm swung clear
     behind the torso rather than folded across it, where it would vanish. */
  run: () => [
    fp('legB', 0.40, 43.7, 54.9, 53.1, 69.1, 57.9, 66.3, 50.3, 51.1),       // far thigh, driving forward
    fp('legB.lower', 0.46, 52.3, 65.1, 55.9, 84.8, 59.8, 84.3, 57.9, 64.4), // far shin
    fp('legB.lower', 0.34, 57.8, 86.9, 65.8, 86.3, 65.9, 83.3, 57.9, 82.3), // far foot, flat to the ground
    fp('armB', 0.38, 48.3, 26.7, 43.8, 37.8, 47.7, 39.7, 53.7, 29.3),       // far upper arm, swung back
    fp('armB', 0.44, 43.7, 39.5, 47.8, 49.7, 50.8, 48.7, 47.8, 38.1),       // far forearm
    f(0.88, 60, 7, 67, 11, 67, 19, 60, 23, 53, 19, 53, 11),                 // head
    f(0.60, 50, 27, 64, 25, 57, 53, 44, 55),                                // torso
    f(0.76, 58, 26, 64, 25, 57, 53),                                        // chest, to the light
    fp('legA', 0.68, 51.5, 50.1, 44.4, 65.6, 49.7, 68.4, 58.5, 53.9),       // near thigh, trailing
    fp('legA.lower', 0.72, 47.6, 62.8, 32.2, 75.6, 34.7, 78.9, 51.2, 67.6), // near shin, below the knee
    fp('legA.lower', 0.84, 31.2, 76.3, 28.8, 84.0, 31.8, 85.2, 35.7, 78.2), // near foot, toed off
    fp('armA', 0.74, 55.1, 28.4, 61.1, 38.8, 65.4, 36.7, 60.9, 25.6),       // near upper arm, forward
    fp('armA', 0.82, 64.5, 39.8, 73.6, 33.7, 71.8, 30.6, 62.0, 35.7)        // near forearm
  ],

  book: () => [
    f(.95, 24, 52, 49, 45, 49, 51, 22, 58),          // left leaf
    f(.72, 51, 45, 76, 52, 78, 58, 51, 51),          // right leaf
    f(.66, 22, 58, 49, 51, 49, 71, 20, 73),          // left page
    f(.86, 51, 51, 78, 58, 80, 73, 51, 71),          // right page
    f(.42, 20, 73, 49, 71, 49, 78, 18, 80),          // left cover
    f(.54, 51, 71, 80, 73, 82, 80, 51, 78),          // right cover
    f(.32, 49, 45, 51, 45, 51, 78, 49, 78)           // spine
  ],

  blade: () => [
    f(.94, 50, 8, 57, 27, 53, 60, 50, 60),           // lit edge
    f(.58, 50, 8, 43, 27, 47, 60, 50, 60),           // shaded edge
    f(.40, 35, 60, 65, 60, 64, 67, 36, 67),          // guard
    f(.56, 46, 67, 54, 67, 53, 85, 47, 85),          // grip
    f(.78, 44, 85, 56, 85, 52, 92, 48, 92)           // pommel
  ],

  tower: () => [
    f(.90, 50, 10, 71, 34, 29, 34),                  // roof
    f(.64, 33, 34, 50, 34, 50, 82, 35, 82),          // lit wall
    f(.44, 50, 34, 67, 34, 65, 82, 50, 82),          // shaded wall
    f(.80, 31, 39, 69, 39, 69, 45, 31, 45),          // band
    f(.26, 44, 60, 56, 60, 56, 82, 44, 82)           // door
  ],

  flame: () => [
    f(.50, 50, 10, 67, 44, 60, 74, 40, 74, 33, 44),  // outer
    f(.78, 50, 23, 61, 48, 56, 71, 44, 71, 39, 48),  // mid
    f(1.0, 50, 40, 58, 58, 50, 71, 42, 58)           // core
  ],

  /* A keyboard, not a whole instrument — the keys are the part that reads as
     "piano" instantly at any size, and they are all straight edges. */
  piano: () => {
    const out = [
      f(.30, 10, 10, 90, 10, 92, 29, 8, 29),         // fallboard
      f(.52, 8, 29, 92, 29, 96, 41, 4, 41)           // key bed, seen from above
    ];
    const n = 8, x0 = 4, x1 = 96, w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const l = x0 + i * w + 0.7, r = x0 + (i + 1) * w - 0.7;
      out.push(f(i % 2 ? .90 : .98, l, 41, r, 41, r, 82, l, 82));
    }
    for (const i of [0, 1, 3, 4, 5]) {              // the 2-then-3 black-key group
      const c = x0 + (i + 1) * w, b = w * 0.33;
      out.push(f(.10, c - b, 41, c + b, 41, c + b * 0.8, 67, c - b * 0.8, 67));
    }
    out.push(f(.22, 4, 82, 96, 82, 96, 92, 4, 92));  // front lip
    return out;
  },

  shield: () => [
    f(.86, 50, 9, 82, 21, 79, 52, 50, 81),           // lit half
    f(.52, 50, 9, 18, 21, 21, 52, 50, 81),           // shaded half
    f(1.0, 50, 29, 67, 40, 50, 53, 33, 40)           // charge
  ],

  goblet: () => [
    f(.84, 30, 20, 70, 20, 62, 45, 38, 45),          // bowl
    f(.54, 50, 20, 70, 20, 62, 45, 50, 45),          // bowl, shaded side
    f(1.0, 33, 25, 67, 25, 65, 31, 35, 31),          // the wine
    f(.60, 46, 45, 54, 45, 54, 72, 46, 72),          // stem
    f(.42, 34, 72, 66, 72, 71, 81, 29, 81)           // foot
  ],

  bowl: () => [
    f(.92, 16, 43, 84, 43, 80, 51, 20, 51),          // rim
    f(.62, 20, 51, 50, 51, 50, 77, 33, 73),          // body
    f(.40, 50, 51, 80, 51, 67, 73, 50, 77),          // body, shaded side
    f(.28, 41, 76, 59, 76, 57, 83, 43, 83),          // base
    f(.80, 43, 31, 47, 20, 51, 33),                  // steam
    f(.66, 55, 28, 59, 17, 63, 30)
  ],

  /* A feather: barbs stepped along a spine, spread by a sine so the vane is
     full in the middle and tapers at both ends. */
  quill: () => {
    const out = [];
    const ax = 79, ay = 17, bx = 27, by = 69, n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / n, u = (i + 1) / n;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      const qx = ax + (bx - ax) * u, qy = ay + (by - ay) * u;
      const s = 23 * Math.sin(Math.PI * (0.18 + t * 0.78));
      out.push(f(.90 - t * .28, px, py, qx, qy, px - s * .74, py - s * .56));
      out.push(f(.58 - t * .16, px, py, qx, qy, px + s * .56, py + s * .74));
    }
    out.push(f(1.0, 27, 69, 33, 65, 15, 85));        // nib
    return out;
  },

  monitor: () => [
    f(.30, 12, 8, 88, 8, 90, 15, 10, 15),            // bezel, top edge to the light
    f(.22, 10, 15, 90, 15, 88, 64, 12, 64),          // bezel face
    f(.80, 17, 20, 83, 20, 81, 59, 19, 59),          // screen
    f(.95, 17, 20, 48, 20, 19, 59),                  // glare across the corner
    f(.12, 24, 26, 56, 26, 56, 30, 24, 30),          // lines of code
    f(.12, 30, 34, 66, 34, 66, 38, 30, 38),
    f(.12, 30, 42, 52, 42, 52, 46, 30, 46),
    f(.12, 24, 50, 44, 50, 44, 54, 24, 54),
    f(.42, 44, 64, 56, 64, 58, 78, 42, 78),          // neck
    f(.34, 32, 78, 68, 78, 74, 86, 26, 86),          // base
    f(.24, 26, 86, 74, 86, 72, 92, 28, 92)           // base, front lip
  ],

  key: () => [
    ...annulus(32, 30, 18, 9, 8),                    // bow
    f(.04, 32, 21, 41, 30, 32, 39, 23, 30),          // its hole
    f(.62, 29, 46, 39, 46, 39, 86, 29, 86),          // shaft
    f(.78, 39, 66, 51, 66, 51, 72, 39, 72),          // wards
    f(.50, 39, 78, 48, 78, 48, 84, 39, 84)
  ]
};

/* --- generated fallback ------------------------------------------------ */

function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const rngOf = (seed) => {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
};

/**
 * A faceted form for tasks with no authored subject. Star-shaped around its
 * centre by construction — two rings plus a core — so the facets tile without
 * ever overlapping, whatever the seed. Same id, same form, every time.
 */
function gemFacets(id) {
  const r = rngOf(seedOf(id));
  const n = 9, cx = 50, cy = 50;
  const outer = [], inner = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const ro = 30 + r() * 13;
    const ri = ro * (0.40 + r() * 0.18);
    outer.push([cx + Math.cos(a) * ro, cy + Math.sin(a) * ro]);
    inner.push([cx + Math.cos(a) * ri, cy + Math.sin(a) * ri]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [ax, ay] = inner[i], [bx, by] = inner[j];
    const [ox, oy] = outer[i], [px, py] = outer[j];
    out.push(f(litBy((ax + bx + cx) / 3, (ay + by + cy) / 3) * .8 + .12, cx, cy, ax, ay, bx, by));
    out.push(f(litBy((ax + ox + px) / 3, (ay + oy + py) / 3), ax, ay, ox, oy, px, py));
    out.push(f(litBy((ax + bx + px) / 3, (ay + by + py) / 3) * .9, ax, ay, px, py, bx, by));
  }
  return out;
}

/**
 * Subjects the icon picker cannot express, and the words that reach them.
 * A subject needs an entry here only if it has no matching icon key; anything
 * named after an icon is found by the icon alone.
 */
const SUBJECT_WORDS = {
  piano:   ['piano'],
  monitor: ['monitor', 'computer', 'laptop', 'leetcode', 'leet', 'code', 'coding', 'dsa']
};

/**
 * Label first, but **only** for subjects the icon list has no key for, then the
 * icon, then generated.
 *
 * Every icon key is authored, so an icon always matches — which is why a task
 * called Piano was getting a goblet. The label pass fills that gap without
 * overriding an icon the user deliberately chose: naming a task "Morning run"
 * while picking the book icon still gets a book.
 */
function subjectFor(task) {
  const label = String(task.label || '');
  for (const [name, words] of Object.entries(SUBJECT_WORDS)) {
    if (words.some((w) => new RegExp(`\\b${w}`, 'i').test(label))) return SUBJECTS[name];
  }
  return SUBJECTS[task.icon] || null;
}

const facetsFor = (task) => (subjectFor(task) || (() => gemFacets(task.id)))();

/**
 * Where a shard goes when the piece breaks: straight out from the centre, a
 * little further every fifth facet so the burst edge is ragged rather than a
 * clean expanding ring. Derived from the facet, so a shard always flies the way
 * it faces, and the same task always breaks the same way.
 */
function shardOf(fc, i) {
  let sx = 0, sy = 0;
  const n = fc.p.length / 2;
  for (let j = 0; j < fc.p.length; j += 2) { sx += fc.p[j]; sy += fc.p[j + 1]; }
  let vx = sx / n - 50, vy = sy / n - 50;
  let len = Math.hypot(vx, vy);
  if (len < 0.001) { vx = Math.cos(i * 2.4); vy = Math.sin(i * 2.4); len = 1; }
  const reach = 54 + (i % 5) * 7;
  return {
    x: (vx / len * reach).toFixed(1),
    y: (vy / len * reach).toFixed(1),
    r: ((i * 53) % 100) - 50
  };
}

/**
 * Emits the facets, wrapping each consecutive run of same-tagged ones in a `<g>`.
 * The group carries the limb's movement; the polygons inside keep their own idle
 * and shatter animations, so the two compose instead of fighting.
 *
 * A tag of `parent.child` nests — `legA.lower` puts the shin inside the thigh's
 * group. That nesting is what makes a knee a knee: the shin turns about the knee
 * *in the thigh's rotated space*, so it stays attached as the thigh swings. Two
 * sibling groups cannot do it, because the knee they turn about would not move.
 */
function groupFacets(facets, pts) {
  let html = '', top = null, sub = null;
  const shut = (what) => { html += '</g>'.repeat(what); };

  facets.forEach((fc, i) => {
    const [t = null, s = null] = String(fc.k || '').split('.');

    if (t !== top) {
      shut((sub ? 1 : 0) + (top ? 1 : 0));
      sub = null;
      top = t;
      if (top) html += `<g class="limb limb--${top}">`;
    } else if (s !== sub) {
      shut(sub ? 1 : 0);
      sub = null;
    }
    if (s && s !== sub) { sub = s; html += `<g class="limb limb--${top}-${sub}">`; }

    const v = shardOf(fc, i);
    /* --i drives the stagger for all three facet animations; the delay lives in
       CSS so the breakup can stagger far tighter than the idle loop. */
    html += `<polygon points="${pts(fc.p)}" fill="${facetFill(fc.s)}"
      style="--i:${i};--dx:${v.x}px;--dy:${v.y}px;--rot:${v.r}deg"/>`;
  });

  shut((sub ? 1 : 0) + (top ? 1 : 0));
  return html;
}

function polyHTML(task) {
  const facets = facetsFor(task);
  const pts = (p) => {
    const out = [];
    for (let i = 0; i < p.length; i += 2) out.push(`${p[i].toFixed(1)},${p[i + 1].toFixed(1)}`);
    return out.join(' ');
  };
  return `<svg class="poly" viewBox="0 0 100 100" role="img"
               aria-label="${esc(task.label)}" preserveAspectRatio="xMidYMid meet">
    ${groupFacets(facets, pts)}
  </svg>`;
}

/* ================================================================== home */

/**
 * Hero: in-window with the soonest end, else the next upcoming.
 * Dimmed rows: other open windows first, then missed, then upcoming. Max two.
 */
function resolveDay() {
  const m = nowMinutes(), wd = isoWeekday(), done = store.doneToday();

  /* Two different questions, and they need two different lists.
     `scheduled` — was anything on the books today at all?
     `pool`      — what is still outstanding?
     Deriving "all done" from `pool` cannot work: `pool` is empty in that case
     by definition, so the done state was unreachable and finishing everything
     read as "nothing was scheduled". */
  const scheduled = store.tasks.filter((t) => scheduledToday(t, wd));
  const pool = scheduled.filter((t) => !(done[t.id] && done[t.id].done));

  const open     = pool.filter((t) => inWindow(t, m)).sort((a, b) => endsIn(a, m) - endsIn(b, m));
  const rest     = pool.filter((t) => !inWindow(t, m));
  const upcoming = rest.filter((t) => toMinutes(t.window.start) > m)
                       .sort((a, b) => toMinutes(a.window.start) - toMinutes(b.window.start));
  const missed   = rest.filter((t) => toMinutes(t.window.start) <= m)
                       .sort((a, b) => toMinutes(b.window.start) - toMinutes(a.window.start));

  let hero = null, mode = 'done';
  if (open.length)          { hero = open[0];     mode = 'open'; }
  else if (upcoming.length) { hero = upcoming[0]; mode = 'upcoming'; }

  /* The same ranking the hero came from, continued. Paging forward walks down
     it, so the arrows never contradict the answer the page opened on. */
  const order = [
    ...(hero ? [hero] : []),
    ...open.slice(mode === 'open' ? 1 : 0),
    ...missed,
    ...upcoming.slice(mode === 'upcoming' ? 1 : 0)
  ];

  return { hero, mode, order, anyScheduled: scheduled.length > 0 };
}

/**
 * What the arrows walk.
 *   'today' — outstanding tasks for this weekday, in resolution order.
 *   'done'  — everything scheduled today is finished.
 *   'all'   — nothing is scheduled today, so rather than a dead end the arrows
 *             fall back to the whole list, marked as not being today's work.
 */
function stageList() {
  const { order, anyScheduled } = resolveDay();
  if (order.length) return { list: order, scope: 'today' };
  if (anyScheduled) return { list: [], scope: 'done' };
  return {
    list: store.tasks.slice().sort((a, b) => toMinutes(a.window.start) - toMinutes(b.window.start)),
    scope: 'all'
  };
}

const windowText = (t) => `${t.window.start}–${t.window.end}`;

function taskMeta(task, m, wd) {
  if (!scheduledToday(task, wd))                return `${windowText(task)} · not today`;
  if (inWindow(task, m))                        return `${windowText(task)} · ends in ${fmtDuration(endsIn(task, m))}`;
  if (toMinutes(task.window.start) > m)         return `${windowText(task)} · in ${fmtDuration(startsIn(task, m))}`;
  return `${windowText(task)} · missed`;
}

function pieceHTML(task, m, wd, ix, total) {
  const one = total < 2;
  return `
    <article class="piece" data-house="${task.color}" data-id="${esc(task.id)}"
             tabindex="0" role="button"
             aria-label="${esc(task.label)} — double-click to complete">
      <div class="piece__art">${polyHTML(task)}</div>
      <div class="piece__bar">
        <button type="button" class="piece__nav" data-step="-1"
                aria-label="Previous task" ${one ? 'disabled' : ''}>&larr;</button>
        <div class="piece__id">
          <span class="piece__n mono">${ix + 1}<span class="piece__of">/${total}</span></span>
          <span class="piece__rule" aria-hidden="true"></span>
          <span class="piece__text">
            <h2 class="piece__label">${esc(task.label)}</h2>
            <p class="piece__meta mono">${taskMeta(task, m, wd)}</p>
          </span>
        </div>
        <button type="button" class="piece__nav" data-step="1"
                aria-label="Next task" ${one ? 'disabled' : ''}>&rarr;</button>
      </div>
      <p class="piece__hint">Double-click to complete</p>
    </article>`;
}

/* Which task the arrows are parked on. Clamped, never reset, so a background
   re-render does not yank the page back to the hero mid-browse. */
let stageIx = 0;

function renderHome() {
  const stage = $('#stage'), m = nowMinutes(), wd = isoWeekday();
  const d = new Date();
  $('#dateline').textContent = d.toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long' });

  renderKept();

  const state = (ic, title, body) => {
    delete stage.dataset.house;
    stage.innerHTML = `<div class="state">${icon(ic)}
      <p class="state__title">${title}</p>
      <p class="state__body">${body}</p></div>`;
  };

  if (!store.tasks.length) {
    return state('quill', 'No tasks yet',
      'Write some on the <a href="tasks.html">Tasks</a> page.');
  }

  const { list, scope } = stageList();

  if (scope === 'done') {
    return state('flame', 'All done', 'Every window closed and kept.');
  }

  stageIx = ((stageIx % list.length) + list.length) % list.length;
  const task = list[stageIx];

  stage.dataset.house = task.color;
  stage.dataset.scope = scope;
  stage.innerHTML = pieceHTML(task, m, wd, stageIx, list.length);
}

/* Slightly shorter than the shatter actually runs, so the new piece starts
   gathering while the last shards are still fading. A clean gap between the two
   halves reads as a stutter; the overlap is what makes it feel continuous. */
const SHATTER_MS = 520;
/* Must outlast the slowest form: .58s plus a 12ms stagger over the busiest
   subject (the 27-facet generated one) is .89s. Clearing the class early would
   cut the last shards off mid-flight. */
const FORM_MS = 980;

/* Held while the piece is breaking up, so the 60-second refresh cannot render
   over a half-scattered polygon. */
let swapping = false;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Wraps at both ends — the list is a loop, not a scroll.
 *
 * The outgoing polygon shatters, then the incoming one forms out of the same
 * scatter. The swap happens between the two, so what assembles is genuinely the
 * next task's facets and not a reshuffle of the old ones.
 */
function stepStage(delta) {
  const { list } = stageList();
  if (list.length < 2 || swapping) return;

  const land = () => {
    stageIx = ((stageIx + delta) % list.length + list.length) % list.length;
    renderHome();
    const fresh = $('.poly');
    if (fresh) fresh.classList.add('poly--form');
    /* Drop the class so the idle loop takes back over. */
    setTimeout(() => {
      if (fresh) fresh.classList.remove('poly--form');
      swapping = false;
    }, FORM_MS);
  };

  const poly = $('.poly');
  if (!poly || reducedMotion()) { land(); return; }

  swapping = true;
  poly.classList.add('poly--shatter');
  setTimeout(land, SHATTER_MS);
}

/* ------------------------------------------------------------ kept today */

/** Today's completions, oldest first, so the newest lands at the bottom. */
function keptToday() {
  const done = store.doneToday();
  return store.tasks
    .filter((t) => done[t.id] && done[t.id].done)
    .sort((a, b) => String(done[a.id].at).localeCompare(String(done[b.id].at)));
}

function renderKept() {
  const box = $('#kept');
  if (!box) return;

  const kept = keptToday();
  box.hidden = !kept.length;
  if (!kept.length) { box.innerHTML = ''; return; }

  box.innerHTML = `
    <h2 class="kept__title">Kept today</h2>
    <ul class="kept__list">
      ${kept.map((t) => `
        <li class="kept__item" data-house="${t.color}">
          ${icon(t.icon)}
          <span class="kept__label">${esc(t.label)}</span>
          <button type="button" class="btn btn--quiet kept__undo" data-undo="${esc(t.id)}"
                  title="Put ${esc(t.label)} back"
                  aria-label="Put ${esc(t.label)} back">&#8630;</button>
        </li>`).join('')}
    </ul>`;
}

/* --------------------------------------------------------- completion  */

/* Guards the hand-off: the 60s interval and the visibilitychange re-render
   must not repaint the page out from under the outgoing task. */
let animating = false;

function complete(el, id) {
  if (animating) return;

  store.complete(id);                       // 1. state first, always
  scheduleFlush();
  el.insertAdjacentHTML('beforeend', checkHTML());

  animating = true;
  el.classList.add('fade-out');
  setTimeout(() => { animating = false; renderHome(); }, 360);
}

const checkHTML = () => `<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m4 12.6 5.2 5.4L20 5.6"/></svg>`;

function wireHome() {
  /* An arrow is for paging. Double-clicking one must never complete the task
     it just moved away from. */
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('.piece__nav')) return;
    const el = e.target.closest('.piece');
    if (el) complete(el, el.dataset.id);
  });

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-step]');
    if (nav && !animating) stepStage(+nav.dataset.step);
  });

  /* Only today's completions can be taken back. The box holds nothing else —
     but a tab left open past midnight is still showing yesterday's, so the
     entry is re-checked against today rather than trusted from the render. */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-undo]');
    if (!btn || animating) return;
    const entry = store.doneToday()[btn.dataset.undo];
    if (!entry || !entry.done) { renderHome(); return; }
    store.uncomplete(btn.dataset.undo);
    scheduleFlush();
    renderHome();
  });
  document.addEventListener('keydown', (e) => {
    if (animating) return;
    if (e.key === 'ArrowLeft')  { stepStage(-1); return; }
    if (e.key === 'ArrowRight') { stepStage(1);  return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.piece');
    if (!el) return;
    e.preventDefault();
    complete(el, el.dataset.id);
  });
  /* Lives outside the footer, so renderSync never rebuilds it — wire it once. */
  const peek = $('#syncPeek');
  if (peek) peek.addEventListener('click', () => {
    localStorage.setItem(K.hidden, '0');
    applySyncCollapse();
  });

  setInterval(() => { if (!animating && !swapping) renderHome(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !animating && !swapping) renderHome();
  });
}

/* ================================================================= tasks */

let editing = null;
let expanded = null;        // task id whose history is open
let histMonth = null;       // 'YYYY-MM' shown in that history

/* ------------------------------------------------------------- calendar */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

const thisMonth = () => todayKey().slice(0, 7);

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Monday-first cells for a month. Leading blanks are null. */
function monthCells(month) {
  const [y, m] = month.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() || 7) - 1;
  const days = new Date(y, m, 0).getDate();
  const cells = new Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(m)}-${pad(d)}`);
  return cells;
}

const GLYPH = { done: '✓', missed: '✗', today: '○', off: '–', future: '', unknown: '?' };
const STATE_WORD = {
  done: 'done', missed: 'missed', today: 'today, not yet done',
  off: 'not scheduled', future: 'still to come', unknown: 'no record'
};

/**
 * A completion is a fact and always wins — including on a weekday the task is
 * no longer scheduled for. `config/tasks.json` holds only the task's *current*
 * days, with no history of past schedules, so a day is called `missed` only
 * when the current schedule covers it and the month was actually fetched.
 */
function dayState(task, key) {
  if ((store.log[key] || {})[task.id]?.done) return 'done';

  const today = todayKey();
  if (key > today) return 'future';
  if (!scheduledToday(task, isoWeekday(new Date(`${key}T00:00:00`)))) return 'off';
  if (key === today) return 'today';
  if (store.monthState(key.slice(0, 7)) === 'unknown') return 'unknown';
  return 'missed';
}

function historyHTML(task, month) {
  const cells = monthCells(month);
  const states = cells.map((key) => (key ? dayState(task, key) : null));
  const count = (s) => states.filter((x) => x === s).length;

  const grid = cells.map((key, i) => {
    if (!key) return '<li class="cal__pad" aria-hidden="true"></li>';
    const state = states[i];
    const d = +key.slice(8);
    return `<li class="cal__day cal__day--${state}"
                title="${d} ${monthLabel(month)} — ${STATE_WORD[state]}">
              <span class="cal__n mono">${d}</span>
              <span class="cal__mark" aria-hidden="true">${GLYPH[state]}</span>
              <span class="visually-hidden">${d} ${STATE_WORD[state]}</span>
            </li>`;
  }).join('');

  const unknowns = count('unknown');
  const notes = [];
  if (unknowns) {
    notes.push(hasToken()
      ? 'Some days are still loading from <span class="mono">tracker-data</span>.'
      : 'Not synced — only days recorded in this browser are known.');
  }
  if (task.days && task.days.length && task.days.length < 7) {
    notes.push('Misses follow the task’s current days. Changing them re-reads the past.');
  }

  return `
    <div class="history" id="hist-${esc(task.id)}">
      <div class="history__bar">
        <button class="btn btn--quiet" data-mon="-1"
                ${month <= shiftMonth(thisMonth(), -HISTORY_MONTHS) ? 'disabled' : ''}
                aria-label="Previous month">&larr;</button>
        <span class="history__month">${monthLabel(month)}</span>
        <button class="btn btn--quiet" data-mon="1"
                ${month >= thisMonth() ? 'disabled' : ''}
                aria-label="Next month">&rarr;</button>
        <span class="history__tally mono">${count('done')} done · ${count('missed')} missed</span>
      </div>

      <ol class="cal__head mono" aria-hidden="true">
        ${DAY_LETTERS.map((l) => `<li>${l}</li>`).join('')}
      </ol>
      <ol class="cal">${grid}</ol>

      <p class="history__legend mono">✓ done &nbsp; ✗ missed &nbsp; ○ today &nbsp; – not scheduled</p>
      ${notes.map((n) => `<p class="history__note">${n}</p>`).join('')}
    </div>`;
}

/* ---------------------------------------------------------------- list */

function renderTasks() {
  const list = $('#taskList');
  if (!store.tasks.length) {
    list.innerHTML = '<li class="empty">Nothing written down yet.</li>';
    return;
  }
  const ordered = store.tasks.slice()
    .sort((a, b) => toMinutes(a.window.start) - toMinutes(b.window.start));

  list.innerHTML = ordered.map((t) => {
    const open = expanded === t.id;
    return `
    <li class="item${open ? ' item--open' : ''}" data-house="${t.color}">
      <div class="item__row">
        ${icon(t.icon)}
        <button type="button" class="item__toggle" data-hist="${esc(t.id)}"
                aria-expanded="${open}" aria-controls="hist-${esc(t.id)}">
          <span class="item__label">${esc(t.label)}</span>
        </button>
        <span class="item__days">${daysLabel(t.days)}</span>
        <span class="item__window">${windowText(t)}</span>
        <span class="item__actions">
          <button class="btn btn--quiet" data-edit="${esc(t.id)}">Edit</button>
          <button class="btn btn--quiet" data-del="${esc(t.id)}">Delete</button>
        </span>
      </div>
      ${open ? historyHTML(t, histMonth || thisMonth()) : ''}
    </li>`;
  }).join('');
}

/** Paint first, then fill in whatever the network can add. */
async function showHistory(id, month) {
  expanded = id;
  histMonth = month;
  renderTasks();
  if (id === null) return;
  try {
    if (await ensureMonth(month)) renderTasks();
  } catch (err) {
    setStatus(`load failed — ${err.message}`);
    renderSync();
  }
}

const daysLabel = (days) => DAY_LETTERS
  .map((l, i) => (!days || !days.length || days.includes(i + 1)) ? `<b>${l}</b>` : l).join('');

function buildForm() {
  $('#f_color').innerHTML = HOUSES
    .map((h) => `<option value="${h}">${h[0].toUpperCase()}${h.slice(1)}</option>`).join('');
  $('#f_icon').innerHTML = ICON_KEYS.map((k) =>
    `<button type="button" data-icon="${k}" aria-pressed="false" title="${k}">${icon(k)}</button>`).join('');
  $('#f_days').innerHTML = DAY_LETTERS.map((l, i) =>
    `<button type="button" data-day="${i + 1}" aria-pressed="false">${l}</button>`).join('');

  $('#f_icon').addEventListener('click', (e) => {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    $('#f_icon').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  $('#f_days').addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
}

function fillForm(task) {
  editing = task ? task.id : null;
  $('#formTitle').textContent = task ? 'Edit task' : 'New task';
  $('#f_id').value = task ? task.id : '';
  $('#f_label').value = task ? task.label : '';
  $('#f_color').value = task ? task.color : 'stark';
  $('#f_start').value = task ? task.window.start : '';
  $('#f_end').value = task ? task.window.end : '';
  $('#f_error').textContent = '';
  ['#f_label', '#f_start', '#f_end'].forEach((sel) => flag($(sel), false));

  const iconKey = task ? task.icon : 'shield';
  $('#f_icon').querySelectorAll('[data-icon]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.icon === iconKey)));
  const days = task ? task.days : [];
  $('#f_days').querySelectorAll('[data-day]').forEach((b) =>
    b.setAttribute('aria-pressed', String(days.includes(+b.dataset.day))));
}

const flag = (input, bad) => input.setAttribute('aria-invalid', String(!!bad));

/**
 * A time input can sit half-entered — the field shows "09:--" but `value` is
 * empty and `badInput` is true. That is a different mistake from a malformed
 * value, and reporting it as one sends people looking for the wrong problem.
 */
function timeProblem(input, which) {
  if (input.validity.badInput) return `Finish entering the ${which} time, including AM/PM.`;
  if (!input.value.trim())     return `${which === 'start' ? 'Start' : 'End'} time is required.`;
  if (toMinutes(input.value.trim()) === null) {
    return `${which === 'start' ? 'Start' : 'End'} time is not a valid 24-hour time.`;
  }
  return null;
}

/** Invalid windows are rejected here, not on the home page. */
function readForm() {
  const labelEl = $('#f_label'), startEl = $('#f_start'), endEl = $('#f_end');

  const label = labelEl.value.trim();
  if (!label) return { error: 'A task needs a label.', field: labelEl };

  const startErr = timeProblem(startEl, 'start');
  if (startErr) return { error: startErr, field: startEl };
  const endErr = timeProblem(endEl, 'end');
  if (endErr) return { error: endErr, field: endEl };

  const start = startEl.value.trim(), end = endEl.value.trim();
  const s = toMinutes(start), e = toMinutes(end);
  if (s === e) {
    return { error: 'Start and end cannot be the same — the window would be empty.', field: endEl };
  }

  const pressed = (sel) => [...document.querySelectorAll(sel)].filter((b) => b.getAttribute('aria-pressed') === 'true');
  const iconKey = (pressed('#f_icon [data-icon]')[0] || {}).dataset?.icon || 'shield';
  const days = pressed('#f_days [data-day]').map((b) => +b.dataset.day).sort();

  return {
    task: {
      id: editing || uniqueId(label),
      label,
      icon: iconKey,
      color: $('#f_color').value,
      window: { start, end },
      days
    }
  };
}

function uniqueId(label) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'task';
  let id = base, n = 2;
  while (store.tasks.some((t) => t.id === id)) id = `${base}-${n++}`;
  return id;
}

function wireTasks() {
  buildForm();
  fillForm(null);

  /* Flag a half-entered time as soon as focus leaves it, so it is obvious which
     field is unfinished without waiting for a save. Clear it as they correct it. */
  ['#f_start', '#f_end'].forEach((sel) => {
    const input = $(sel);
    input.addEventListener('blur', () => flag(input, input.validity.badInput));
    input.addEventListener('input', () => { if (!input.validity.badInput) flag(input, false); });
  });

  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    ['#f_label', '#f_start', '#f_end'].forEach((sel) => flag($(sel), false));

    const { task, error, field } = readForm();
    if (error) {
      $('#f_error').textContent = error;
      if (field) { flag(field, true); field.focus(); }
      return;
    }

    const i = store.tasks.findIndex((t) => t.id === task.id);
    if (i >= 0) store.tasks[i] = task; else store.tasks.push(task);
    store.saveTasks();
    scheduleFlush();
    fillForm(null);
    renderTasks();
  });

  $('#f_cancel').addEventListener('click', () => fillForm(null));

  $('#taskList').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      fillForm(store.tasks.find((t) => t.id === edit.dataset.edit));
      $('#f_label').focus();
      return;
    }

    const mon = e.target.closest('[data-mon]');
    if (mon) {
      showHistory(expanded, shiftMonth(histMonth || thisMonth(), +mon.dataset.mon));
      return;
    }

    const del = e.target.closest('[data-del]');
    if (del) {
      const task = store.tasks.find((t) => t.id === del.dataset.del);
      if (!task || !confirm(`Delete “${task.label}”?`)) return;
      store.tasks = store.tasks.filter((t) => t.id !== task.id);
      store.saveTasks();
      scheduleFlush();
      if (editing === task.id) fillForm(null);
      if (expanded === task.id) expanded = null;
      renderTasks();
      return;
    }

    /* Clicks inside an open history are for reading, not for closing it. */
    if (e.target.closest('.history')) return;

    const row = e.target.closest('.item');
    if (!row) return;
    const id = row.querySelector('[data-hist]')?.dataset.hist;
    if (!id) return;
    /* Reopening on a different task starts back at the current month. */
    showHistory(expanded === id ? null : id, expanded === id ? null : thisMonth());
  });
}

/* ============================================================== sync bar */

let status = '';

function setStatus(text) {
  status = text;
  const node = $('.sync__status');
  if (node) node.textContent = text;
}

/* Collapsed by choice, remembered. The status line stays visible either way —
   a failed flush must never be hidden behind a closed drawer. */
const syncHidden = () => localStorage.getItem(K.hidden) === '1';

function applySyncCollapse() {
  const foot = $('#sync');
  if (!foot) return;
  const hidden = syncHidden();
  foot.classList.toggle('sync--collapsed', hidden);

  /* Collapsed on Home means gone. No conditions. */
  const gone = hidden && page === 'home';
  foot.classList.toggle('sync--gone', gone);

  /* The chevron is the only way back once the bar is gone, so it is shown
     exactly when the bar is not. */
  const peek = $('#syncPeek');
  if (peek) peek.hidden = !gone;

  const btn = $('#syncToggle');
  if (btn) {
    btn.setAttribute('aria-expanded', String(!hidden));
    btn.textContent = hidden ? 'Show' : 'Hide';
    btn.setAttribute('aria-label', hidden ? 'Show sync details' : 'Hide sync details');
  }
}

function renderSync() {
  const foot = $('#sync');
  const c = cfg();

  const body = hasToken()
    ? `<p class="sync__note">Syncing <span class="mono">${esc(c.owner)}/${DATA_REPO}</span>.
          Completions flush on a 30-second debounce and when this page is hidden.</p>
       <div class="sync__row">
         <button class="btn" id="syncNow">Sync now</button>
         <button class="btn" id="forget">Forget token</button>
       </div>`
    : `<p class="sync__note">Working from local storage. Add a fine-grained token scoped to
          <span class="mono">${DATA_REPO}</span> (Contents: read&nbsp;and&nbsp;write) to sync.
          It is kept in this browser only — never in a file, a commit, or a URL.</p>
       <div class="sync__row">
         <label><span class="field__label">GitHub user</span>
           <input class="input mono" id="ghOwner" autocomplete="off" value="${esc(c.owner)}"></label>
         <label><span class="field__label">Token</span>
           <input class="input mono" id="ghToken" type="password" autocomplete="off"></label>
         <button class="btn btn--primary" id="ghSave">Save</button>
       </div>`;

  foot.innerHTML = `<div class="sync__inner">
      <div class="sync__bar">
        <p class="sync__status mono">${esc(status || (hasToken() ? '' : 'local only'))}</p>
        <button class="btn btn--quiet sync__toggle" id="syncToggle" aria-controls="syncBody"
                aria-expanded="true">Hide</button>
      </div>
      <div class="sync__body" id="syncBody">${body}</div>
    </div>`;

  const on = (sel, fn) => { const n = $(sel); if (n) n.addEventListener('click', fn); };

  on('#syncToggle', () => {
    localStorage.setItem(K.hidden, syncHidden() ? '0' : '1');
    applySyncCollapse();
  });
  applySyncCollapse();

  on('#ghSave', () => {
    const owner = $('#ghOwner').value.trim(), token = $('#ghToken').value.trim();
    if (!owner || !token) { setStatus('user and token are both required'); return; }
    localStorage.setItem(K.owner, owner);
    localStorage.setItem(K.token, token);
    $('#ghToken').value = '';
    renderSync();
    pull();
  });
  on('#forget', () => {
    localStorage.removeItem(K.token);
    setStatus('local only');
    renderSync();
  });
  on('#syncNow', flush);
}

/* ================================================================== boot */

function render() {
  if (page === 'home') renderHome(); else renderTasks();
  renderSync();
}

store.load();
setStatus(hasToken() ? 'loading' : 'local only');
render();
if (page === 'home') wireHome(); else wireTasks();
pull();
if (store.dirty.tasks || store.dirty.months.length) scheduleFlush();
