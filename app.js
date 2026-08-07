'use strict';

/* ============================================================== constants */

const HOUSES = ['targaryen', 'stark', 'lannister', 'tyrell', 'greyjoy', 'martell', 'arryn'];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DATA_REPO = 'tracker-data';
const FLUSH_MS = 30000;

const K = {
  tasks: 'ledger.tasks',
  log:   'ledger.log',
  dirty: 'ledger.dirty',
  owner: 'ledger.owner',
  token: 'ledger.token'
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

  load() {
    this.tasks = (readJSON(K.tasks, { tasks: [] }).tasks || []).map(normalize).filter(Boolean);
    this.log   = readJSON(K.log, {});
    this.dirty = Object.assign({ tasks: false, months: [] }, readJSON(K.dirty, {}));
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

  doneToday() { return this.log[todayKey()] || {}; },

  complete(id) {
    const day = todayKey();
    (this.log[day] = this.log[day] || {})[id] = { done: true, at: isoLocal() };
    this.saveLog(day.slice(0, 7));
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
    const month = todayKey().slice(0, 7);
    const { data } = await ghRead(`data/${month}.json`);
    if (data) {
      for (const [date, entries] of Object.entries(data)) {
        store.log[date] = { ...entries, ...store.log[date] };   // local wins
      }
      localStorage.setItem(K.log, JSON.stringify(store.log));
    }
    setStatus(store.dirty.months.length || store.dirty.tasks ? 'pending' : 'synced');
    render();
  } catch (err) {
    setStatus(`load failed — ${err.message}`);
  }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('online', flush);

/* ================================================================== home */

/**
 * Hero: in-window with the soonest end, else the next upcoming.
 * Dimmed rows: other open windows first, then missed, then upcoming. Max two.
 */
function resolveDay() {
  const m = nowMinutes(), wd = isoWeekday(), done = store.doneToday();
  const pool = store.tasks.filter((t) => scheduledToday(t, wd) && !(done[t.id] && done[t.id].done));

  const open     = pool.filter((t) => inWindow(t, m)).sort((a, b) => endsIn(a, m) - endsIn(b, m));
  const rest     = pool.filter((t) => !inWindow(t, m));
  const upcoming = rest.filter((t) => toMinutes(t.window.start) > m)
                       .sort((a, b) => toMinutes(a.window.start) - toMinutes(b.window.start));
  const missed   = rest.filter((t) => toMinutes(t.window.start) <= m)
                       .sort((a, b) => toMinutes(b.window.start) - toMinutes(a.window.start));

  let hero = null, mode = 'done';
  if (open.length)          { hero = open[0];     mode = 'open'; }
  else if (upcoming.length) { hero = upcoming[0]; mode = 'upcoming'; }

  const dimmed = [
    ...open.slice(mode === 'open' ? 1 : 0).map((t) => [t, 'open']),
    ...missed.map((t) => [t, 'missed']),
    ...upcoming.slice(mode === 'upcoming' ? 1 : 0).map((t) => [t, 'upcoming'])
  ].slice(0, 2);

  return { hero, mode, dimmed, anyToday: pool.length > 0 };
}

const windowText = (t) => `${t.window.start}–${t.window.end}`;

function heroHTML(task, mode, m) {
  const meta = mode === 'open'
    ? `${windowText(task)} · ends in <b>${fmtDuration(endsIn(task, m))}</b>`
    : `${windowText(task)} · in <b>${fmtDuration(startsIn(task, m))}</b>`;
  return `
    <article class="card" data-house="${task.color}" data-id="${esc(task.id)}"
             tabindex="0" role="button" aria-label="${esc(task.label)} — double-click to complete">
      <div class="card__head">
        ${icon(task.icon, 'icon--hero')}
        <span class="card__eyebrow">${mode === 'open' ? 'Now' : 'Next'}</span>
      </div>
      <h2 class="card__label">${esc(task.label)}</h2>
      <p class="card__meta">${meta}</p>
      <p class="card__hint">Double-click to complete</p>
    </article>`;
}

function rowHTML(task, kind, m) {
  const meta = kind === 'missed' ? 'missed'
    : kind === 'open' ? `ends in ${fmtDuration(endsIn(task, m))}`
    : `in ${fmtDuration(startsIn(task, m))}`;
  return `
    <li class="row row--${kind}" data-house="${task.color}" data-id="${esc(task.id)}"
        tabindex="0" role="button" aria-label="${esc(task.label)} — double-click to log">
      ${icon(task.icon)}
      <span class="row__label">${esc(task.label)}</span>
      <span class="row__meta">${windowText(task)} · ${meta}</span>
    </li>`;
}

function renderHome() {
  const stage = $('#stage'), list = $('#secondary'), m = nowMinutes();
  const d = new Date();
  $('#dateline').textContent = d.toLocaleDateString(undefined,
    { weekday: 'long', day: 'numeric', month: 'long' });

  if (!store.tasks.length) {
    stage.innerHTML = `<div class="state">${icon('quill')}
      <p class="state__title">No tasks yet</p>
      <p class="state__body">Write some on the <a href="tasks.html">Tasks</a> page.</p></div>`;
    list.innerHTML = '';
    return;
  }

  const { hero, mode, dimmed, anyToday } = resolveDay();

  if (!hero) {
    delete stage.dataset.house;
    stage.innerHTML = `<div class="state">${icon(anyToday ? 'flame' : 'moon')}
      <p class="state__title">${anyToday ? 'All done' : 'Nothing today'}</p>
      <p class="state__body">${anyToday
        ? 'Every window closed and kept.'
        : 'No task is scheduled for this weekday.'}</p></div>`;
  } else {
    stage.dataset.house = hero.color;
    stage.innerHTML = heroHTML(hero, mode, m);
  }

  list.innerHTML = dimmed.map(([t, kind]) => rowHTML(t, kind, m)).join('');
}

/* ------------------------------------------------------------- the burn  */

let animating = false;

function complete(el, id, grand) {
  if (animating) return;

  store.complete(id);                       // 1. state first, always
  scheduleFlush();
  el.insertAdjacentHTML('beforeend', checkHTML());

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  animating = true;

  if (!grand || reduced) {                  // fade, no dragon
    el.classList.add('fade-out');
    setTimeout(finish, 360);
    return;
  }

  if (!dragonArt) {                         // asset never arrived — fade instead
    el.classList.add('fade-out');
    setTimeout(finish, 360);
    return;
  }

  const stage = $('#stage');
  stage.insertAdjacentHTML('beforeend', dragonHTML());
  const dragon = $('.dragon', stage);
  dragon.style.setProperty('--travel', `${stage.offsetWidth + 300}px`);
  setTimeout(() => el.classList.add('is-burning'), 1000);
  setTimeout(finish, 2500);

  function finish() { animating = false; renderHome(); }
}

/* The dragon is a separate asset so app.js stays readable. Fetched once, kept in
   memory, and never on the critical path — the completion is already written. */
let dragonArt = null;

function loadDragon() {
  fetch('dragon.svg', { cache: 'force-cache' })
    .then((r) => (r.ok ? r.text() : null))
    .then((svg) => { if (svg && svg.includes('<svg')) dragonArt = svg; })
    .catch(() => { /* stays null; completions fall back to a fade */ });
}

const checkHTML = () => `<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m4 12.6 5.2 5.4L20 5.6"/></svg>`;

/* Public-domain heraldic dragon (see dragon.svg) plus an original fire plume,
   which is drawn outside the mirrored art so the flame keeps its direction. */
const dragonHTML = () => `
<div class="dragon" aria-hidden="true"><div class="dragon__bob">
  <div class="dragon__art">${dragonArt}</div>
  <svg class="dragon__fire" viewBox="0 0 140 70" fill="none" aria-hidden="true">
    <defs><linearGradient id="dragonfire" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FFE9C4"/><stop offset=".4" stop-color="#FF8A1E"/>
      <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="M4 20C30 6 68 14 136 46c-30-8-56-6-74-12c8 8 12 14 14 20
             c-20-8-40-18-58-24c-10-3-16-6-14-10Z" fill="url(#dragonfire)"/>
    <path d="M8 24c26 0 56 10 92 28" stroke="#FFE9C4" stroke-width="2" opacity=".7"/>
    <path d="M8 17c30-4 62 8 100 28" stroke="#FFB458" stroke-width="2" opacity=".45"/>
  </svg>
</div></div>`;

function wireHome() {
  const target = (e) => e.target.closest('.card, .row');
  document.addEventListener('dblclick', (e) => {
    const el = target(e);
    if (el) complete(el, el.dataset.id, el.classList.contains('card'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.card, .row');
    if (!el) return;
    e.preventDefault();
    complete(el, el.dataset.id, el.classList.contains('card'));
  });
  loadDragon();
  setInterval(() => { if (!animating) renderHome(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !animating) renderHome(); });
}

/* ================================================================= tasks */

let editing = null;

function renderTasks() {
  const list = $('#taskList');
  if (!store.tasks.length) {
    list.innerHTML = '<li class="empty">Nothing written down yet.</li>';
    return;
  }
  const ordered = store.tasks.slice()
    .sort((a, b) => toMinutes(a.window.start) - toMinutes(b.window.start));

  list.innerHTML = ordered.map((t) => `
    <li class="item" data-house="${t.color}">
      ${icon(t.icon)}
      <span class="item__label">${esc(t.label)}</span>
      <span class="item__days">${daysLabel(t.days)}</span>
      <span class="item__window">${windowText(t)}</span>
      <span class="item__actions">
        <button class="btn btn--quiet" data-edit="${esc(t.id)}">Edit</button>
        <button class="btn btn--quiet" data-del="${esc(t.id)}">Delete</button>
      </span>
    </li>`).join('');
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

  const iconKey = task ? task.icon : 'shield';
  $('#f_icon').querySelectorAll('[data-icon]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.icon === iconKey)));
  const days = task ? task.days : [];
  $('#f_days').querySelectorAll('[data-day]').forEach((b) =>
    b.setAttribute('aria-pressed', String(days.includes(+b.dataset.day))));
}

/** Invalid windows are rejected here, not on the home page. */
function readForm() {
  const label = $('#f_label').value.trim();
  if (!label) return { error: 'A task needs a label.' };

  const start = $('#f_start').value.trim(), end = $('#f_end').value.trim();
  const s = toMinutes(start), e = toMinutes(end);
  if (s === null) return { error: 'Start time is not a valid 24-hour time.' };
  if (e === null) return { error: 'End time is not a valid 24-hour time.' };
  if (s === e)    return { error: 'Start and end cannot be the same — the window would be empty.' };

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

  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const { task, error } = readForm();
    if (error) { $('#f_error').textContent = error; return; }

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
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const task = store.tasks.find((t) => t.id === del.dataset.del);
    if (!task || !confirm(`Delete “${task.label}”?`)) return;
    store.tasks = store.tasks.filter((t) => t.id !== task.id);
    store.saveTasks();
    scheduleFlush();
    if (editing === task.id) fillForm(null);
    renderTasks();
  });
}

/* ============================================================== sync bar */

let status = '';

function setStatus(text) {
  status = text;
  const node = $('.sync__status');
  if (node) node.textContent = text;
}

function renderSync() {
  const foot = $('#sync');
  const c = cfg();

  foot.innerHTML = hasToken()
    ? `<div class="sync__inner">
         <p class="sync__status mono">${esc(status)}</p>
         <p class="sync__note">Syncing <span class="mono">${esc(c.owner)}/${DATA_REPO}</span>.
            Completions flush on a 30-second debounce and when this page is hidden.</p>
         <div class="sync__row">
           <button class="btn" id="syncNow">Sync now</button>
           <button class="btn" id="forget">Forget token</button>
         </div>
       </div>`
    : `<div class="sync__inner">
         <p class="sync__status mono">${esc(status || 'local only')}</p>
         <p class="sync__note">Working from local storage. Add a fine-grained token scoped to
            <span class="mono">${DATA_REPO}</span> (Contents: read&nbsp;and&nbsp;write) to sync.
            It is kept in this browser only — never in a file, a commit, or a URL.</p>
         <div class="sync__row">
           <label><span class="field__label">GitHub user</span>
             <input class="input mono" id="ghOwner" autocomplete="off" value="${esc(c.owner)}"></label>
           <label><span class="field__label">Token</span>
             <input class="input mono" id="ghToken" type="password" autocomplete="off"></label>
           <button class="btn btn--primary" id="ghSave">Save</button>
         </div>
       </div>`;

  const on = (sel, fn) => { const n = $(sel); if (n) n.addEventListener('click', fn); };

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
