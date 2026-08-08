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

### Asset versions

Both pages reference their assets with a content hash — `app.js?v=b5e6ed79`, `style.css?v=eb77df83`.

GitHub Pages sends `cache-control: max-age=600` on every file. Without the stamp, a browser reuses the `app.js` it already has and a deploy sits invisible for up to ten minutes, looking exactly like a failed push.

The version is **derived, never typed**. `scripts/stamp-assets.sh` hashes each asset and rewrites the references; `scripts/githooks/pre-commit` runs it on every commit and re-stages the pages. Enable once per clone:

```
git config core.hooksPath scripts/githooks
```

Do not replace this with a hand-bumped number. A version that has to be remembered gets forgotten, and it fails silently.

This does not make deploys instant — `index.html` is cached for ten minutes too, so a stale page will still ask for stale assets by their old names. What it fixes is the worse half: once the page is refetched, its assets are guaranteed fresh rather than served from cache. A normal reload is now enough; a hard reload is not needed.

The hook is local to a clone. Committing from a machine that has not run the `git config` line above will produce an unstamped commit — check the pages if a deploy looks stale.

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

### The sync bar when collapsed

Collapsed, the bar disappears **completely** on Home — no status line, no handle, no rule. Unconditionally.

The **Tasks page never hides it**, so the Show handle always exists somewhere. Do not extend `sync--gone` to that page without first giving the bar another way back.

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

Show **one** task, never a list. The dimmed secondary rows are gone; arrows replace them.

### The piece

The task fills the page as a low-poly illustration — flat triangular facets shaded off its house accent — with its name, number and window on a bar beneath, and a round arrow either side.

**Left, not centred.** Home drops the centred column and runs down the page's left edge, in line with the masthead title — the date, the illustration, and the arrow bar all share that edge. Only Home; the Tasks page stays centred.

**One layer.** The illustration sits directly on `--ash`. No card, no `--iron` surface, no border, no accent bar down the side, no rule under the art. The empty and done states are flat for the same reason — they stand in the same slot, and a bordered box there would read as a bug. The only rule on the page is the short vertical one between the number and the name.

- **Arrows page the same ranking the hero came from.** `resolveDay` returns `order`, the resolution order continued past the hero. Paging forward walks down it, so the arrows can never contradict the answer the page opened on. Position `1/n` is always the hero.
- The list **wraps at both ends**. It is a loop, not a scroll.
- `stageIx` is **clamped, never reset**. The 60-second re-render must not yank the page back to the hero mid-browse.
- Left/Right arrow keys do the same thing as the buttons.
- **Nothing scheduled today** → the arrows fall back to walking every task rather than becoming a dead end, and each is marked *not today* in italic. `stageList()` returns the scope so the page can say which it is showing.
- Double-clicking the art still completes. Double-clicking an **arrow** must not — it would complete the task the arrow just moved away from.

### The artwork

Original. Facets are `{ s, p }` — a shade in `0..1` and a flat list of `x,y` in a 100×100 box — shaded by one light from the upper left so every subject agrees. `0` is the accent sunk into `--ash`, `1` is the accent lifted toward `--parchment`; fills are `color-mix` on `var(--accent)`, so a task's house colour drives the whole illustration.

Two sources, in `app.js`:

- `SUBJECTS` — hand-authored. **All twelve icon keys** are drawn, plus `piano`, which has no icon key.
- `gemFacets(id)` — a generated faceted form seeded from the task id. Star-shaped around its centre by construction (core plus two rings), so facets tile without overlapping whatever the seed, and the same id always gives the same form. Now a **safety net**: with every icon key authored and `normalize()` forcing an unknown icon to `shield`, it should not be reached in normal use. Keep it — it is what guarantees `facetsFor()` never returns nothing.

**How a task finds its subject** (`subjectFor`), in order:

1. **Label**, but only for subjects the icon picker cannot express — currently just `piano`. Word-boundary prefix match, case-insensitive.
2. **Icon key**.
3. Generated.

The label pass is deliberately narrow. Every icon key is authored, so an icon always matches at step 2 — which is why a task called Piano was getting a goblet. Letting the label win outright would be worse: naming a task "Morning run" while picking the book icon should still get a book, because that icon was a deliberate choice. The label only fills a gap the icon list has no way to express.

To add a subject: write it into `SUBJECTS`. If it shares a name with an icon key it is picked up automatically; if not, it becomes label-addressable with no further wiring.

The loop is facet opacity, out of phase, nothing more. No glow, no filter, no transform — those read as the effects this theme bans. `prefers-reduced-motion` stops it dead at full opacity.

**No borrowed art, ever.** The style is common to low-poly illustration; the shapes here are authored from scratch. Do not trace, import, or adapt an existing illustration — see Legal.

### Completion

Double-click the hero task:

1. Checkmark appears immediately. Task is marked done in `localStorage` right away.
2. The task fades out over ~340ms and is removed from Home.
3. It reappears in **Kept today**, where it can be undone.

**No ceremony.** There is no fire, no dragon, and no spoken word. All three were tried and removed. Completing a task is a thing you do many times a day, and a 1.9-second set piece is only charming the first few. The short fade is not decoration — it is what lets the eye follow the task to the corner box instead of having it blink out.

Do not reintroduce a completion animation. If one is ever wanted again, it belongs behind a setting, not on by default.

The fade is decorative and runs **after** the state change. If it stutters or is interrupted, the completion still stands. Never gate the data write on it finishing.

Respect `prefers-reduced-motion`: drop the fade, hide the task outright.

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

Accent appears on the task's icon and its rule/border. The background never changes color.

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
- Purple/violet gradients, glassmorphism, glow effects of any kind.
- `system-ui` as a display face.

---

## Legal

No HBO or *Game of Thrones* / *House of the Dragon* art, screenshots, logos, or official sigils in either repo. The theme is atmosphere, not assets.

`tracker` is a **public** repo served by GitHub Pages — anything committed here is published. So artwork must be original, public domain, or CC0. No "found on the web" assets with unknown rights, and nothing under a share-alike licence (CC BY-SA would bind the whole repo).

Current artwork:

| Asset | Source | Rights |
|---|---|---|
| Task icons (`ICONS` in `app.js`) | original | — |
| Low-poly subjects (`SUBJECTS` in `app.js`) | original — facet coordinates authored by hand; nothing traced from or adapted out of any existing illustration | — |
| Generated forms (`gemFacets` in `app.js`) | original — computed from the task id | — |

The site carries no borrowed text either — the one invented word it used has been removed along with the fire. That was a design decision, not a legal one: the word was always fine to use, since a single invented word is not copyrightable and this rule bars art, screenshots, logos, and sigils, not vocabulary.

Character designs are not fine, in any form. That includes 3D models, fan sculpts, game rips, and traced silhouettes — a render of a copyrighted creature is still a derivative of it.
