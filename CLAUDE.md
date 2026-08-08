# CLAUDE.md

Personal day-to-day task tracker. Static site on GitHub Pages. Westeros theme.

Two pages. Nothing else.

- **Home** — shows the task that fits the current time. Double-click to complete.
- **Tasks** — create, edit, delete tasks.

---

## Non-goals

Do not build these. Do not suggest them.

- No login, no accounts, no multi-user.
- No streaks, stats, charts, calendars, or history views.
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

### Time handling

- Normalize `start` and `end` to minutes-since-midnight for all comparisons.
- If `end < start`, the window wraps past midnight (e.g. `23:00`–`01:00`). Handle it explicitly.
- Reject invalid windows at save time on the Tasks page, not at render time on Home.

---

## Home page

Home is a chart, not a list. A full-bleed engraved map of an invented continent fills the page; today's tasks stand as flags on its mountain summits. Drag or scroll to move around it; on load it glides to the hero.

Recompute the active task on a 60-second interval and on `visibilitychange`. Not a 1-second loop.

Resolution order — **unchanged**. The chart is a new presentation of the same answer:

1. Drop tasks not scheduled for today's weekday. Drop tasks already completed today.
2. **In-window** → the one with the **soonest `end`** is the hero. The task about to expire is the one that matters.
3. **Nothing in-window** → the next upcoming task is the hero, with a countdown ("Gym in 2h").
4. **All done for today** → explicit done state. Never a blank screen.
5. **Missed windows** → dimmed, still tappable to log late. Never the hero.

Show **one** hero, plus at most **two** dimmed. That limit is what keeps the chart readable — seven labelled plates on screen collide with each other and with the map's own lettering.

### The chart

`index.html` carries the map inline (~150 KB). It is not fetched: the map *is* the page, and a fetch would flash an empty screen.

- **The range is fixed.** Twelve summits, generated once. The land does not rearrange itself when tasks change.
- **Position is rank, not clock.** Tasks sort by start time and take peaks in order, so scrolling south is moving later through the day. Big peaks are too far apart to hold an exact hour — a 06:00 and an 06:30 task would want the same latitude. Do not add an hour scale; it would claim a precision the layout does not have.
- **There is no `anchor` field and no placement step.** Time decides the peak. Nothing to store, nothing to choose.
- `PEAKS` in `app.js` mirrors the summits in the inline SVG. Regenerate one and you must regenerate the other.
- The scroll box must match the viewBox aspect (`1200 / 2000`) exactly. Letterbox or crop it and every flag drifts off the summit it points at.

Three label tiers, from the resolution order: the hero gets a full plate, the two dimmed get a name only, the rest are bare flags that name themselves on hover or focus. After layout a solver pushes overlapping plates apart and fades any map lettering still covered. Flags never leave their summits — only plates move.

### Completion

Double-click a flag:

1. Checkmark appears immediately. Task is marked done in `localStorage` right away.
2. Fire rises from that summit, and the word **Dracarys** is spoken across the chart.
3. The flag burns off the map and does not come back today.

No dragon. It was tried twice — heraldic line art and a hand drawing — and both read as flat cutouts sliding across the screen. Fire alone is better, and it is the part that always looked right.

The fire is built from two layers of small SVG tongues at different blurs and opacities, screen-blended so they add light rather than occlude what is under them. Gradients and soft edges are what make it read as fire; solid shapes read as clipart.

The animation is decorative and runs **after** the state change. If it stutters or is interrupted, the completion still stands. Never gate the data write on the animation finishing.

Respect `prefers-reduced-motion`: skip the fire, fade the flag out instead. The word may stay, since it is text and not motion.

---

## Tasks page

A list of tasks with add / edit / delete. Each task has: label, icon, house color (fixed dropdown), start time, end time, days of week.

That's it. No bulk actions, no drag-to-reorder, no categories.

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
| The chart of Arcandia (inline in `index.html`) | original — coastline, relief, forests and lettering generated from seed `20260807`; nothing traced from any map, real or fictional | — |

The word **Dracarys** is fine. A single invented word is not copyrightable, and this rule bars art, screenshots, logos, and sigils — not vocabulary. It is decorative text on a personal site, not branding on a product.

Character designs are not fine, in any form. That includes 3D models, fan sculpts, game rips, and traced silhouettes — a render of a copyrighted creature is still a derivative of it.
