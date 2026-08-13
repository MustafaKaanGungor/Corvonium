# Corvonium — Stack & Architecture

Corvonium is a self-hosted, offline-first planner for scheduling work and then following through on it. It combines calendar, tasks, and focused work tracking into one PWA that runs on phone and desktop, syncing through a small self-hosted server.

> **Status:** living document. Sections marked **TBD** are still being decided.

---

## 1. Core Principles

1. **Offline-first.** The local database on each device is the source of truth for that device. Every read/write is local and instant. The network is only used for background sync.
2. **Hub-and-spoke sync.** All clients sync with one server (the hub). Clients never talk to each other directly. The hub is a *role*, not specific hardware — it can run on your desktop today and a home server tomorrow.
3. **Replicas are interchangeable.** Every device holds a full copy of the data. Devices can be added or removed freely; the server can be rebuilt from any client.
4. **One language.** TypeScript across frontend, sync server, and tooling.
5. **Tasks and events are the same thing.** There is one schedulable entity. "Calendar" and "Tasks" are two *views* of the same data, not two data types. This is the central product decision — everything downstream follows from it.

---

## 2. Product Shape

### 2.1 One item, many shapes

A task and an event differ far less than most apps pretend. Both have a title, can start at a time, can end at a time, can live in a project, can have a location. The differences are only:

- an event **occupies a block** of time; a task often just has a **deadline**
- a task gets **completed**; an event usually just happens

Both of those are properties, not separate types. So Corvonium has a single `items` collection, and the UI decides how to draw an item based on which scheduling fields are filled in.

**Scheduling states** (all derived from the fields, not stored as a mode):

| State | Fields set | Calendar view | Task view |
|---|---|---|---|
| **Unscheduled** | none | **never shown** — there is no date to place it at | shown, no date |
| **Deadline only** | `due` | marker at that time on that day | shown, sorted by due |
| **Timed block** | `start` + `end` | box spanning the range | shown, sorted by start |
| **All-day** | `startDate` (+ `endDate`) | all-day strip at top of day | shown under that date |

An item can have **both a block and a deadline** — "work on it Tuesday 14:00–16:00, due Friday". The calendar draws the block; the task view can sort by either.

`kind: 'task' | 'event'` still exists, but only to drive **defaults and filtering** ("hide events", "new task" starts unscheduled, "new event" starts as a block). It is not a hard boundary — an item can move between the two freely. Everything else — completion, subtasks, recurrence, projects — applies equally to both.

### 2.2 Status: open, done, cancelled — and *missed*

Every item, event included, can be ticked off. For a task that means finished; for an event it means **attended**. Same checkbox, same field.

```
status: 'open' | 'done' | 'cancelled'
```

**Cancelled is a write-off, not a delete.** The item stays in the database and in history — you decided not to do it. This is distinct from `deleted`, which means "this record was a mistake, forget it existed".

**Missed is derived, never stored.** An item is missed when `status === 'open'` and its time has passed (`due < now`, or `end < now` for a block). Deriving it means it updates itself as the clock moves — no nightly job, no "roll over" batch process that can fail or double-run offline. Missed items surface at the **top** of both Today and Task view, where they can be completed late or cancelled.

### 2.3 Subtasks

A flat checklist on any item — task or event. Title and a checkbox, reorderable, nothing else. No due dates, no assignees, no nesting.

Stored as **their own documents** (`subtasks` collection with an `itemId`), not as an array inside the item. This is a sync decision, not a UI one: an embedded array under last-write-wins loses edits when you tick subtask A on your phone and subtask B on your desktop before they sync — and checking things off on whatever device is at hand is exactly what you'll do. Separate documents make that merge correctly for free. The UI is still a plain checklist.

### 2.4 Recurrence

Tasks and events both recur. The item editor offers presets that generate an RRULE behind the scenes:

| Preset | RRULE |
|---|---|
| Every day | `FREQ=DAILY` |
| Every N days | `FREQ=DAILY;INTERVAL=N` |
| Every week (pick weekdays) | `FREQ=WEEKLY;BYDAY=MO,WE` |
| Every N weeks | `FREQ=WEEKLY;INTERVAL=N` |
| Every month | `FREQ=MONTHLY` |
| Custom | raw RRULE |

Occurrences are expanded at render time, never stored as rows. **Completing or cancelling one occurrence writes a small override item** carrying `seriesId` + `originalStart` + its status — the same mechanism as editing a single occurrence. So the series stays one document and only the occurrences you actually touched cost a row.

### 2.5 The three screens

**1. Calendar View** — day/week/month. Shows only items that have a date: blocks, all-day items, deadline markers. Unscheduled items are never drawn here. This is where scheduling happens: drag an item onto a time slot to give it a block; drag a block to reschedule.

**2. Task View** — the same items as a list, grouped and sorted by title/project/date rather than laid out in time. This is where capture and triage happen: add items quickly, set projects and priorities, work through the backlog. Unscheduled items live here.

**3. Today** — the daily driver, in this order:
1. **Missed** — open items whose time has passed. Complete late, or cancel.
2. **Today** — blocks starting today, all-day items for today, items due today.
3. **Unscheduled** — items with no date at all, available to pick up.

and carries the **Start Working** button that transitions into Work Mode.

**Project filter.** Both Calendar and Task view can be filtered to a single project, so you can look at one stream of work in isolation. Project colour drives item colour on the calendar.

The three screens read the same collection with different queries. Nothing is duplicated.

### 2.6 Work Mode

Triggered by **Start Working** on Today (and, presumably, from an item anywhere). It's the "doing" half of the app, as opposed to the "planning" half that the other three screens cover: a focused surface showing the item being worked on and a running timer, recording a session against that item when it ends.

The pomodoro engine lives here. Sessions link to an item via `itemId`, which is what makes "how long did this actually take" answerable later.

**TBD** — to be filled in as we go:
- What's on screen in Work Mode (item + timer only? subtasks? notes? next-up queue?)
- Does it take over the whole screen, or is it a persistent bar?
- What ends a session — timer expiry, marking the item done, manual stop?
- Does an interrupted/abandoned session still get recorded?
- Is the timer always pomodoro-shaped, or is a plain stopwatch/open-ended session allowed?

### 2.7 Open product questions

1. **Recurring items flood the Missed list.** A daily task skipped for three weeks derives 21 missed occurrences and turns Today into a graveyard. *(Recommendation: for a recurring series, show only the most recent unresolved occurrence as missed and silently write off the older ones.)*
2. **Unscheduled items in Today** — the whole backlog, or only items you explicitly pull in for the day? Showing all of it makes Today unusable once the backlog grows past a screenful.
3. **Is the project filter global or per-screen?** Sticky across Calendar and Task view ("I'm in project X mode"), or set independently on each?
4. Do projects get their own screen (a project detail view), and can they nest?
5. Does cancelling a single occurrence of a recurring item ever mean "and stop the series"?
6. Priority — keep the 0/1/2 field, or is project + ordering enough? It's currently in the model but has no defined UI.

---

## 3. The Stack

| Layer | Choice | Role |
|---|---|---|
| Language | **TypeScript** | Everywhere |
| Frontend | **React + Vite** | UI, built as an installable PWA |
| Styling | **Tailwind CSS** | Utility-first styling |
| Local DB / sync engine | **RxDB** | Reactive local database (IndexedDB), change tracking, replication |
| Sync server | **Node.js + Fastify** | Small TS service exposing pull/push replication endpoints |
| Server DB | **SQLite** (via `better-sqlite3`) | Single-file storage behind the sync server |
| Dates | **date-fns** | Calendar math |
| Recurrence | **rrule** | RFC 5545 rule parsing + occurrence expansion |
| Ordering | **fractional-indexing** | Conflict-tolerant manual sort order |
| Desktop wrapper *(later)* | **Tauri** | Native desktop app around the same React code |
| Mobile wrapper *(later, optional)* | **Capacitor** | Only if PWA notification limits bite |
| Deployment *(later)* | **Docker + Caddy** | Containerized server + reverse proxy with auto-TLS |
| Remote access *(later)* | **WireGuard / Tailscale** | Sync from outside LAN without exposing ports |

### Alternatives considered

- **PouchDB + CouchDB** — least sync code (replication built into protocol), but you inherit CouchDB's document/revision model and run CouchDB itself.
- **PowerSync / ElectricSQL** — polished Postgres↔SQLite sync, heavier self-hosting footprint.
- **Replicache / Zero** — excellent mutator-based model, more upfront concepts.
- **Flutter** — one codebase everywhere, but heavyweight web output and Dart is less transferable.
- **Electron** instead of Tauri — mature but ships a full Chromium per app.
- **PostgreSQL** instead of SQLite — switch later only if multi-user or heavy query needs appear.

---

## 4. System Topology

```
                ┌─────────────────────────┐
                │      SYNC SERVER        │
                │  Fastify + SQLite       │
                │  (desktop now,          │
                │   home server later)    │
                └───────────▲─────────────┘
                            │ HTTPS (pull/push + live stream)
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────┴──────┐    ┌───────┴──────┐    ┌───────┴──────┐
│  Phone PWA   │    │ Desktop PWA/ │    │  Any future  │
│  IndexedDB   │    │    Tauri     │    │    device    │
└──────────────┘    └──────────────┘    └──────────────┘
```

- Each client = full replica + local UI.
- The server = the replica that is always online; it stores canonical state and relays changes.
- Removing the server: all devices keep working; only cross-device propagation pauses.
- New server: stand it up empty; the first syncing client pushes the full dataset.
- **Make the server URL a first-class client setting** so migrating hubs is a config change.

---

## 5. Data Model

All collections share sync-friendly fields. **Rules that everything depends on:**

- `id`: **UUID v4, generated on the client** (never server auto-increment — records are created offline).
- `createdAt`: epoch millis, set once. Never changes.
- `updatedAt`: epoch millis, set on every mutation. Used for last-write-wins conflict resolution.
- `deleted`: boolean tombstone. **Never hard-delete**; set `deleted: true` and let it sync. (Optionally purge tombstones server-side after all clients have seen them, e.g. 30+ days.)

### `items` — tasks *and* events

```ts
{
  id: string,                    // uuid
  title: string,
  notes: string,
  kind: 'task' | 'event',        // defaults + filtering only, not a hard boundary

  // --- scheduling (any combination, all optional) ---
  allDay: boolean,               // which pair below is authoritative
  start: number | null,          // epoch millis (timed) — block begins
  end: number | null,            // epoch millis (timed) — block ends
  startDate: string | null,      // 'YYYY-MM-DD' (all-day) — floating date, not an instant
  endDate: string | null,        // 'YYYY-MM-DD' (all-day), inclusive
  due: number | null,            // epoch millis — deadline, a point not a block
  tzid: string | null,           // IANA zone the item was scheduled in (needed for recurrence + DST)

  // --- recurrence ---
  rrule: string | null,          // RFC 5545, e.g. "FREQ=WEEKLY;BYDAY=MO"
  seriesId: string | null,       // set on override/exception items, points at the parent series
  originalStart: number | null,  // which occurrence this item overrides

  // --- status ---
  status: 'open' | 'done' | 'cancelled',
  completedAt: number | null,    // done — finished, or for an event, attended
  cancelledAt: number | null,    // cancelled — written off, deliberately not done

  // --- organisation ---
  projectId: string | null,
  tags: string[],
  location: string | null,
  priority: 0 | 1 | 2,
  sortOrder: string,             // fractional index — conflict-tolerant manual ordering

  createdAt: number,
  updatedAt: number,
  deleted: boolean
}
```

**Notes on the shape:**

- **All-day items are dates, not instants.** Storing UTC-midnight millis and rendering in local time shifts them a day for negative UTC offsets. Hence the separate `startDate`/`endDate` strings.
- **There is no `missed` field.** Missed is a query — `status === 'open'` and the item's time has passed. Storing it would require a background job to flip it, which is exactly the kind of thing that breaks on a device that was asleep.
- **`cancelled` ≠ `deleted`.** Cancelled is a real outcome the user chose and it stays visible in history. `deleted` is a tombstone meaning the record shouldn't exist at all.
- **Recurrence is expanded at render time** with the `rrule` library — never materialize every occurrence as a row. Completing, cancelling, or editing a single occurrence creates an override item carrying `seriesId` + `originalStart`. *("This and all following" edits still need a decision — see Open Questions in §6.)*
- **`sortOrder` is a string, not a number.** Numeric order breaks under last-write-wins: two devices reordering produce ties and duplicates. Fractional indexing generates a key *between* two neighbours, so reorders never renumber and never collide.

### `subtasks`

A flat checklist belonging to one item. Deliberately minimal — no dates, no nesting, no status beyond a checkbox.

```ts
{
  id: string,
  itemId: string,               // parent item
  title: string,
  done: boolean,
  sortOrder: string,            // fractional index
  createdAt: number,
  updatedAt: number,
  deleted: boolean
}
```

> Own collection rather than an array on the item, so concurrent ticks on two devices merge instead of clobbering each other. Costs one extra query in the item editor and one more collection in the replication loop.

### `projects`

```ts
{
  id: string,
  name: string,
  color: string | null,
  archived: boolean,
  sortOrder: string,
  createdAt: number,
  updatedAt: number,
  deleted: boolean
}
```

### `sessions` — recorded work

```ts
{
  id: string,
  kind: 'work' | 'shortBreak' | 'longBreak',
  itemId: string | null,        // what was being worked on
  startedAt: number,
  endedAt: number,
  durationSec: number,          // planned length (e.g. 1500)
  completed: boolean,           // finished vs abandoned
  createdAt: number,
  updatedAt: number,
  deleted: boolean
}
```

> **The running timer is never synced.** It is local UI state only. Sync the *completed session record* after the fact. Compute the timer from a stored `startedAt` timestamp (`remaining = duration - (now - startedAt)`), never from a `setInterval` counter — this survives tab suspension and phone sleep.

### `settings` (synced app preferences)

```ts
{
  id: "settings",
  pomodoroWorkSec: number,
  pomodoroShortBreakSec: number,
  pomodoroLongBreakSec: number,
  longBreakEvery: number,
  weekStartsOn: 0 | 1,
  defaultCalendarView: 'day' | 'week' | 'month',
  createdAt: number,
  updatedAt: number,
  deleted: false
}
```

### Device config (local only, **never synced**)

Server URL, auth token, notification permissions, theme. These live in `localStorage` (or an unreplicated RxDB collection), because you cannot sync the settings that tell you how to sync — and because they are genuinely per-device.

---

## 6. Sync Design

### Protocol (RxDB replication)

RxDB replicates each collection via HTTP endpoints **you implement** on the Fastify server:

- **Pull** — `GET /sync/:collection/pull?checkpoint=...&limit=...`
  Returns documents changed since the client's checkpoint, plus a new checkpoint.
- **Push** — `POST /sync/:collection/push`
  Client sends its changed docs (each with the assumed previous state). Server detects conflicts, applies winners, returns the conflicting docs so the client can re-merge.
- **Live stream (optional but nice)** — `GET /sync/stream` via **Server-Sent Events**.
  Server emits "something changed" pings; clients re-pull immediately instead of polling. This is what makes an edit on desktop appear on the phone within a second.

### Server-side storage

One SQLite table per collection mirroring the document shape, plus indexes for checkpoint queries. The server is *dumb by design*: it stores documents, orders them by change time, and relays them. All app logic lives in clients.

### Conflict resolution

- Strategy: **last-write-wins by `updatedAt`**.
- Good enough for a single user racing themself; upgrade to field-level merge only if real data loss ever annoys you.

### Client behavior

- All UI reads/writes go to RxDB only — components subscribe to RxDB queries and re-render reactively (this is RxDB's core strength).
- Replication runs in the background: retry with backoff, resume on `online` events and app focus.
- Show a subtle sync-state indicator (synced / pending / offline) — invaluable for trust and debugging.

### Open technical questions

Carried over from review, still to resolve:

1. **Checkpoint ordering.** Checkpointing on client `updatedAt` silently skips documents pushed late by a long-offline device. Needs a server-assigned monotonic `serverSeq`.
2. **Clock skew.** Client-stamped `updatedAt` means a device with a fast clock wins every conflict forever.
3. **Push conflict semantics.** RxDB's `assumedMasterState` comparison vs. server-side LWW are different strategies; pick one explicitly.
4. **SSE + bearer auth** don't compose — `EventSource` can't set headers.
5. **Tombstone purge vs. stale clients** — a client offline longer than the purge window resurrects deleted docs.
6. **Recurrence editing** — "this and all following", and deleting single occurrences.
7. **Schema migrations** — RxDB `schemaVersion` + `migrationStrategies`, and SQLite migrations, must exist before Phase 1 ships real data.

---

## 7. Frontend Architecture

```
src/
├── db/
│   ├── schema/            # RxDB collection schemas (items, subtasks, projects, sessions, settings)
│   ├── database.ts        # createDatabase(), singleton access
│   └── replication.ts     # per-collection replication setup, server URL from device config
├── features/
│   ├── calendar/          # day/week/month layout, drag-to-schedule, rrule expansion
│   ├── tasks/             # list view, grouping, triage, quick capture
│   ├── today/             # today + due + overdue query, Start Working entry point
│   ├── work/              # work mode surface, timer state machine, session recording
│   └── projects/          # project management
├── components/            # shared UI (buttons, dialogs, layout)
├── lib/                   # date helpers, recurrence, uuid, ordering, notification helpers
├── App.tsx
└── main.tsx
```

Guidelines:

- **The database is the state manager.** No Redux/Zustand for domain data — components subscribe to RxDB queries directly (thin hooks like `useItems(filter)`). Keep component-local state (open dialogs, form drafts) in React state.
- **One item editor**, shared by all three screens. Since tasks and events are one type, there is one edit surface; the screens differ in how they *list* items, not how they *edit* them.
- **Work mode as a state machine:** `idle → work → shortBreak → work → ... → longBreak`. Persist `{ phase, startedAt, cyclesDone, itemId }` locally so a page reload/app restart resumes correctly.
- **Notifications:** use the Notification API + service worker. Works well on desktop and Android; iOS PWA background notifications are unreliable — the eventual argument for Capacitor. *(Scheduled due-date reminders need a real decision — browsers can't reliably schedule future local notifications.)*

### PWA specifics

- **Service worker** via `vite-plugin-pwa` (Workbox under the hood): precache the app shell so it boots with zero network.
- **Web app manifest**: name, icons, `display: standalone`, theme color → installable on phone home screen.
- App data lives in IndexedDB, *not* the service worker cache — the SW only caches code/assets.
- Request **persistent storage** (`navigator.storage.persist()`) to reduce eviction risk on mobile.

---

## 8. Server Architecture

```
server/
├── src/
│   ├── db.ts              # better-sqlite3 setup, migrations
│   ├── routes/
│   │   ├── sync.ts        # pull/push per collection
│   │   └── stream.ts      # SSE change notifications
│   ├── auth.ts            # bearer token check
│   └── index.ts           # Fastify bootstrap
├── data/app.db            # the entire database (back this up)
└── Dockerfile             # for the home-server phase
```

- **Auth:** single-user, so keep it simple — one long random bearer token, checked on every request, stored in each client's device config. Add real accounts only if the app ever grows users.
- **HTTPS:** required for PWA features when not on `localhost`. On LAN: either a Caddy reverse proxy with a local CA, or Tailscale/WireGuard which gives you both encryption and stable addressing for free — often the pragmatic answer.
- **Backups:** the whole system state is one SQLite file. A nightly copy (`sqlite3 app.db ".backup backup.db"`) is a complete backup. Every client is also a de-facto backup.

---

## 9. Build Phases

**Phase 1 — Local-only PWA (usable end product on its own)**
React + Vite + Tailwind + RxDB. Build the `items` model first, then Task view → Today → Work mode → Calendar view (roughly increasing difficulty). PWA install + offline shell. No server, no sync.

**Phase 2 — Sync server on the desktop**
Fastify + SQLite, pull/push endpoints, bearer auth. Wire up RxDB replication in the client. Test conflict cases deliberately (edit same item on two browsers while one is offline).

**Phase 3 — Phone on the LAN**
Serve over the LAN (HTTPS via Tailscale or local Caddy). Install the PWA on the phone. Live-sync via SSE. This completes the phone+desktop system.

**Phase 4 — Home server migration**
Dockerize the server, run behind Caddy on the home server, copy the SQLite file over (or just let a client re-push), change the server URL in device config. Nothing else changes.

**Phase 5 — Optional native wrappers**
Tauri desktop app and/or Capacitor mobile app if PWA limits (notifications, storage eviction) become real problems. Same React codebase.

---

## 10. Pitfalls Checklist

- [ ] Client-generated UUIDs everywhere — no server-assigned IDs
- [ ] Tombstones (`deleted: true`) — no hard deletes
- [ ] `updatedAt` set on **every** mutation, including tombstoning; `createdAt` never changes
- [ ] Store timed values in UTC (epoch millis); store all-day values as `YYYY-MM-DD` strings
- [ ] Keep `tzid` on anything recurring — DST and travel break naive UTC expansion
- [ ] `sortOrder` is a fractional-index string, never an integer
- [ ] "Missed" is derived from `status` + the clock, never a stored flag or a nightly job
- [ ] `cancelled` is a status, not a deletion — cancelled items stay in history
- [ ] Subtasks are documents, not an embedded array — embedded checklists lose concurrent ticks
- [ ] Completing one occurrence of a recurring item writes an override, not a mutation of the series
- [ ] Timer computed from `startedAt` timestamps, never from interval ticks
- [ ] Never sync the live timer — only completed session records
- [ ] Server URL + auth token in **local-only** device config, never in the synced settings doc
- [ ] Checkpoint on a server-assigned sequence, not on client `updatedAt`
- [ ] Declare RxDB `schemaVersion` + migration strategies before storing real data
- [ ] Request persistent storage in the PWA
- [ ] Back up the server's SQLite file regularly — and test a restore once
