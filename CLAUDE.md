# CLAUDE.md

Personal day-to-day task tracker. Static site on GitHub Pages. Westeros theme.

Two pages. Nothing else.

- **Home** — shows the task that fits the current time. Double-click to complete.
- **Tasks** — create, edit, delete tasks.

---

## Non-goals

Do not build these. Do not suggest them.

- No login, no accounts, no multi-user.
- No streaks or stats. No charts. No history view **except** the per-task calendar on the Tasks page (below) — that one carve-out is deliberate and bounded; it does not open the door to a dashboard.
- No notifications, reminders, or service workers.
- No scoring or relevance model. Time-window matching is the whole suggestion logic.
- No backend, no framework beyond what's listed below.

If a feature isn't in this file, it isn't in scope. Ask before adding.

---

## Stack

- Vanilla HTML/CSS/JS, or a single-file build if it stays simple. No React.
- No build step if avoidable.
- Two files: `index.html` (home), `tasks.html` (tasks). Shared `app.js`, `style.css`.

---

## Storage

Two repos:

| Repo | Visibility | Contents |
|---|---|---|
| `tracker` | public | the site. Pages serves from here. **No data, no tokens.** |
| `tracker-data` | private | JSON only. Nothing runs from here. |

### Token

Fine-grained PAT, scoped to `tracker-data` only, Contents: read/write. Nothing else.

- Entered by the user into a field on the live site.
- Stored in `localStorage` only.
- **Never written to any file in either repo.** Never logged, never in a URL, never in a commit.
- If no token is present, the site works read-only from local data and shows a prompt to add one.

### Files in `tracker-data`

- `config/tasks.json` — task definitions. Changes rarely.
- `data/YYYY-MM.json` — completion logs, one file per month. Changes often.

Keep them separate. Do not merge into one file.

### Read

Use the contents API with auth:

```
GET /repos/{owner}/tracker-data/contents/{path}
```

Do **not** use `raw.githubusercontent.com` — it's CDN-cached for ~5 minutes and writes will appear to vanish.

Boot fetches `config/tasks.json` and **the current month only**. Past months are fetched lazily, one file per month, the first time a task history pages back to them. `ledger.months` in `localStorage` records the outcome per month (`loaded` / `missing`) so each is fetched once.

That record is load-bearing, not a cache detail. A month that was never fetched is `unknown`, and a day inside it can only be drawn as "no record" — never as a miss. Absence of a completion is evidence only once the month file has been read.

Paging stops at `HISTORY_MONTHS` (12) back from the current month.

### Write

Read-modify-write with optimistic locking:

1. `GET` the file → base64 `content` + `sha`
2. Decode, mutate, re-encode
3. `PUT` the same path with new content **and the `sha` you just got**
4. On `409`/`422`: refetch, replay the mutation, retry once. Then surface an error.

Every write sends the current `sha`. No exceptions.

### Sync model

`localStorage` is the source of truth during a session. GitHub is a background flush.

- Completing a task writes to `localStorage` immediately. UI never waits on the network.
- Flush to GitHub on a ~30s debounce and on `visibilitychange` (page hidden).
- Never commit on every interaction. The commit log should stay readable.
- Offline: everything still works, flush retries when back online.

---

## Data shapes

`config/tasks.json`:

```json
{
  "tasks": [
    {
      "id": "run",
      "label": "Morning run",
      "icon": "run",
      "color": "targaryen",
      "window": { "start": "06:00", "end": "09:00" },
      "days": [1, 2, 3, 4, 5]
    }
  ]
}
```

- `days` — ISO weekday numbers, 1 = Monday. Empty or absent = every day.
- `color` — one of the house keys below. Fixed list, not a freeform picker.
- `window` — **wall-clock strings. Never UTC.** "06:00" means 6am wherever the user is.

`data/2026-08.json`:

```json
{
  "2026-08-07": {
    "run": { "done": true, "at": "2026-08-07T07:12:00+05:30" }
  }
}
```

Log timestamps carry an offset. Window definitions do not.

### Undo is a tombstone

Taking a completion back writes `{ "done": false, "at": ... }`. It must **never** delete the key.

`mergeMonth` spreads remote first and local second, so a key deleted locally is merely absent from the local side and the remote `done: true` survives the next flush — the task would come back done. Only a value can outrank a value.

Everything that reads the log tests `.done` rather than key presence, so `done: false` correctly reads as outstanding on Home and as a non-completion in the task history.

### Time handling

- Normalize `start` and `end` to minutes-since-midnight for all comparisons.
- If `end < start`, the window wraps past midnight (e.g. `23:00`–`01:00`). Handle it explicitly.
- Reject invalid windows at save time on the Tasks page, not at render time on Home.

---

## Home page

Recompute the active task on a 60-second interval and on `visibilitychange`. Not a 1-second loop.

Resolution order:

1. Drop tasks not scheduled for today's weekday. Drop tasks already completed today.
2. **In-window** → show the one with the **soonest `end`**. The task about to expire is the one that matters.
3. **Nothing in-window** → show the next upcoming task with a countdown ("Gym in 2h").
4. **All done for today** → explicit done state. Never a blank screen.
5. **Missed windows** → dimmed secondary row so they can still be logged late. Never the hero.

Show **one** task as the hero, plus at most **two** dimmed. More than that and this is just the Tasks page with worse spacing.

### Completion

Double-click the hero task:

1. Checkmark appears immediately. Task is marked done in `localStorage` right away.
2. Fire rises from the base of the card in a wave, left to right, and the word **Dracarys** appears to the side.
3. The task chars, burns away, and is removed from Home.

No dragon. It was tried twice — heraldic line art and a hand drawing — and both read as flat cutouts sliding across the screen. Fire alone is better, and it is the part that always looked right.

The fire is built from two layers of small SVG tongues at different blurs and opacities, screen-blended so they add light rather than occlude the card. Gradients and soft edges are what make it read as fire; solid shapes read as clipart.

The animation is decorative and runs **after** the state change. If it stutters or is interrupted, the completion still stands. Never gate the data write on the animation finishing.

Respect `prefers-reduced-motion`: skip the fire, fade the task out instead. The word may stay, since it is text and not motion.

### Kept today

A small box pinned to the bottom-right corner, listing what has been completed today, oldest first. Hidden entirely when nothing has been kept. Below `34rem` it drops into normal flow at the end of the page rather than floating — on a narrow screen it would cover the task it is reporting on.

Each entry has an undo control that puts the task back on the page. **Only today's completions can be undone** — the box holds nothing else, but a tab left open past midnight will still be showing yesterday's, so the handler re-checks the entry against today instead of trusting what was rendered.

Undo is not a delete. See below.

---

## Tasks page

A list of tasks with add / edit / delete. Each task has: label, icon, house color (fixed dropdown), start time, end time, days of week.

No bulk actions, no drag-to-reorder, no categories.

### Task history

Clicking a row expands a month calendar for that task alone. One task at a time; opening another closes the first and resets to the current month.

Six day states, resolved in this order — the order is the whole correctness story:

1. **done** — a completion is logged. Wins over everything below, including a weekday the task is no longer scheduled for.
2. **future** — after today. Never a miss.
3. **not scheduled** — the task's current `days` don't cover that weekday.
4. **today** — reached its day but not yet logged. Not a miss.
5. **no record** — the month was never fetched. Not a miss.
6. **missed** — scheduled, past, month fetched, no entry.

Two honesty constraints, both easy to break:

- **`missed` requires a fetched month.** Never infer a miss from an empty local log. Without a token every past month is `unknown`, and the panel says so rather than drawing a wall of crosses.
- **Past schedules are not recorded.** `config/tasks.json` stores only a task's *current* days and window, with no history. Edit a task's days and its past misses are recomputed under the new schedule. Rule 1 limits the damage — real completions never disappear — but misses before an edit are an approximation, and the panel says so. Do not present them as exact, and do not add schedule versioning to fix it; that's a bigger change than this view is worth.

State is carried by a glyph (`✓ ✗ ○ –`) first and colour second, so the calendar survives being read without colour.

---

## Theme

Westeros. Dark, weathered, ink-and-ash. Not neon, not glossy.

The house colors are **visual dressing only**. Tasks are not named after kingdoms and carry no house semantics — a color is just a color the user picked.

### Base

| Token | Hex | Use |
|---|---|---|
| `--ash` | `#0E0B0A` | page background — warm near-black, not blue-black |
| `--iron` | `#1C1715` | cards, raised surfaces |
| `--soot` | `#332B27` | borders, dividers, hairlines |
| `--parchment` | `#E8DCC4` | primary text |
| `--dust` | `#8C8074` | secondary text, dimmed rows, timestamps |

### House accents (fixed list — task `color` field)

| Key | Hex |
|---|---|
| `targaryen` | `#B4131A` |
| `stark` | `#8FA3B0` |
| `lannister` | `#C9A227` |
| `tyrell` | `#4E7A3E` |
| `greyjoy` | `#2E5D6B` |
| `martell` | `#C25A1E` |
| `arryn` | `#7FA8D9` |

Accent appears on the task's icon, its rule/border, and the fire glow on burn. The background never changes color.

### Type

- **Display** — `IM Fell English SC` (Google Fonts). Headings, task labels. Inky, 17th-century, has texture. Used with restraint.
- **Body** — `EB Garamond`. All running text.
- **Utility** — `JetBrains Mono`. Times, countdowns, dates. Data reads as data.

Set a real type scale. Display gets size and letterspacing, not bold weight.

### Detail

- Border radius: `2px`. Near-square. Nothing rounded.
- Borders: 1px hairlines in `--soot`. No drop shadows — depth comes from surface value, not blur.
- Icons: hand-drawn SVG line art, sigil-shaped, single-stroke. Inline in the repo.

### Never use

- `bg-slate-*`, `bg-gray-*`, `text-indigo-*`, or any default Tailwind palette color.
- Default Tailwind/Bootstrap shadow utilities.
- `Cinzel` — it's the stock fantasy typeface and reads as a template.
- Emoji as icons.
- Purple/violet gradients, glassmorphism, glow effects beyond the fire.
- `system-ui` as a display face.

---

## Legal

No HBO or *Game of Thrones* / *House of the Dragon* art, screenshots, logos, or official sigils in either repo. The theme is atmosphere, not assets.

`tracker` is a **public** repo served by GitHub Pages — anything committed here is published. So artwork must be original, public domain, or CC0. No "found on the web" assets with unknown rights, and nothing under a share-alike licence (CC BY-SA would bind the whole repo).

Current artwork:

| Asset | Source | Rights |
|---|---|---|
| Task icons (`ICONS` in `app.js`) | original | — |
| Fire (`FLAME_SHAPES` / `pyreHTML` in `app.js`) | original | — |

The word **Dracarys** is fine. A single invented word is not copyrightable, and this rule bars art, screenshots, logos, and sigils — not vocabulary. It is decorative text on a personal site, not branding on a product.

Character designs are not fine, in any form. That includes 3D models, fan sculpts, game rips, and traced silhouettes — a render of a copyrighted creature is still a derivative of it.
