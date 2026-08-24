# Corvonium — Stack & Architecture

Corvonium is a self-hosted, offline-first planner for scheduling work and then following through on it. It combines calendar, tasks, and focused work tracking into one PWA that runs on phone and desktop, syncing through a small self-hosted server.

> **Status:** living document. Sections marked **TBD** are still being decided.
>
> **Prototypes** — both clickable, source in `design/`:
>
> - Mobile, at real phone dimensions — `design/corvonium-screens.html` ·
>   <https://claude.ai/code/artifact/1d21c91d-2539-4a92-b9fa-839597a48925>
> - Desktop shell — `design/corvonium-desktop.html` ·
>   <https://claude.ai/code/artifact/2381caef-7a6d-4bec-b590-4caa0dd8f2d1>

---

## 1. Core Principles

1. **Offline-first.** The local database on each device is the source of truth for that device. Every read/write is local and instant. The network is only used for background sync.
2. **Hub-and-spoke sync.** All clients sync with one server (the hub). Clients never talk to each other directly. The hub is a _role_, not specific hardware — it can run on your desktop today and a home server tomorrow.
3. **Replicas are interchangeable.** Every device holds a full copy of the data. Devices can be added or removed freely; the server can be rebuilt from any client.
4. **One language.** TypeScript across frontend, sync server, and tooling.
5. **Tasks and events are the same thing.** There is one schedulable entity. "Calendar" and "Tasks" are two _views_ of the same data, not two data types. This is the central product decision — everything downstream follows from it.

---

## 2. Product Shape

### 2.1 One item, many shapes

A task and an event differ far less than most apps pretend. Both have a title, can start at a time, can end at a time, can live in a project, can have a location. The differences are only:

- an event **occupies a block** of time; a task often just has a **deadline**
- a task gets **completed**; an event usually just happens

Both of those are properties, not separate types. So Corvonium has a single `items` collection, and the UI decides how to draw an item based on which scheduling fields are filled in.

**Scheduling states** (all derived from the fields, not stored as a mode):

| State             | Fields set                | Calendar view                                     | Task view              |
| ----------------- | ------------------------- | ------------------------------------------------- | ---------------------- |
| **Unscheduled**   | none                      | **never shown** — there is no date to place it at | shown, no date         |
| **Deadline only** | `due`                     | marker at that time on that day                   | shown, sorted by due   |
| **Timed block**   | `start` + `end`           | box spanning the range                            | shown, sorted by start |
| **All-day**       | `startDate` (+ `endDate`) | all-day strip at top of day                       | shown under that date  |

An item can have **both a block and a deadline** — "work on it Tuesday 14:00–16:00, due Friday". The calendar draws the block; the task view can sort by either.

`kind: 'task' | 'event'` still exists, but only to drive **defaults and filtering** ("hide events", "new task" starts unscheduled, "new event" starts as a block). It is not a hard boundary — an item can move between the two freely. Everything else — completion, subtasks, recurrence, projects — applies equally to both.

### 2.2 Status: open, done, cancelled — and _missed_

Every item, event included, can be ticked off. For a task that means finished; for an event it means **attended**. Same checkbox, same field.

```
status: 'open' | 'done' | 'cancelled'
```

**Cancelled is a write-off, not a delete.** The item stays in the database and in history — you decided not to do it. This is distinct from deletion (`_deleted`), which means "this record was a mistake, forget it existed".

**Missed is derived, never stored.** An item is missed when `status === 'open'` and its time has passed (`due < now`, or `end < now` for a block). Deriving it means it updates itself as the clock moves — no nightly job, no "roll over" batch process that can fail or double-run offline. Missed items surface at the **top** of both Today and Task view, where they can be completed late or cancelled.

### 2.3 Subtasks

A flat checklist on any item — task or event. Title and a checkbox, reorderable, nothing else. No due dates, no assignees, no nesting.

Stored as **their own documents** (`subtasks` collection with an `itemId`), not as an array inside the item. This is a sync decision, not a UI one: an embedded array under last-write-wins loses edits when you tick subtask A on your phone and subtask B on your desktop before they sync — and checking things off on whatever device is at hand is exactly what you'll do. Separate documents make that merge correctly for free. The UI is still a plain checklist.

### 2.4 Recurrence

Tasks and events both recur. The item editor offers presets that generate an RRULE behind the scenes:

| Preset                     | RRULE                     |
| -------------------------- | ------------------------- |
| Every day                  | `FREQ=DAILY`              |
| Every N days               | `FREQ=DAILY;INTERVAL=N`   |
| Every week (pick weekdays) | `FREQ=WEEKLY;BYDAY=MO,WE` |
| Every N weeks              | `FREQ=WEEKLY;INTERVAL=N`  |
| Every month                | `FREQ=MONTHLY`            |
| Custom                     | raw RRULE                 |

Occurrences are expanded at render time, never stored as rows. **Completing one occurrence writes a small override item** carrying `seriesId` + `originalStart` + its status. So the series stays one document and only the occurrences you actually touched cost a row.

**Cancelling a recurring item always asks which occurrences you mean:**

| Choice                  | What it does                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| **This one**            | override item with `status: cancelled`                                                         |
| **This and all future** | `UNTIL` set on the series' RRULE, just before this occurrence — history before it is untouched |
| **All of them**         | the series document itself goes `status: cancelled`                                            |

The prompt appears every time, with no "don't ask again" — the three outcomes are far enough apart that guessing wrong is worse than one extra tap. **Editing** a recurring item needs the identical three-way choice, so it's one shared component, not two.

### 2.5 The three screens

**1. Calendar View** — a month grid with two modes (§3.2): **Plan**, showing scheduled items as bricks, and **Effort**, showing how much focused work each day held. Unscheduled items are never drawn here. Plan mode is where scheduling happens: drag an item onto a day, drag a brick to reschedule.

**2. Task View** — the same items as a list, grouped by the Eisenhower matrix rather than laid out in time (§3.4). This is where capture and triage happen. Unscheduled items live here.

**3. Today** — the daily driver. A single scrolling list of missed items, today's items, and unscheduled ones, each tagged with why it's there (§3.3), under a **Start the Day** button that transitions into Work Mode.

**Project filter.** Both Calendar and Task view can be filtered to a single project, so you can look at one stream of work in isolation. Project colour drives item colour on the calendar.

The three screens read the same collection with different queries. Nothing is duplicated.

### 2.6 Work Mode — continuous sessions

The "doing" half of the app, as opposed to the "planning" half the other three screens cover. Modelled on **Continuum**, a previous app of the same shape.

**This is not pomodoro.** There are no preset durations and nothing counts down. You press start, a **session** begins, and time accumulates upward until you end it. Within the session you flip between **work** and **break** segments by hand. The app measures what happened; it doesn't prescribe a rhythm.

```
Session
├── segment  work    09:00 → 09:47
├── segment  break   09:47 → 09:55
├── segment  work    09:55 → 10:30   ← live
└── ...
```

- **Session** = one continuous stretch of working, from **Start the Day** to **End Session**.
- **Segment** = one uninterrupted run of either work or break inside it.
- Everything on the summary screen is **derived** from the segments — work total, break total, focus % (work ÷ total), segment count. None of it is stored.

**A day holds as many sessions as you like, and they stack.** Work in the morning, end the session, start another after lunch — that's two sessions and the day's total is their sum. **The day is the atomic unit of reporting**, never the session: nothing in the app reports how much you worked before noon, because the useful question is the day, the week, the month. Sessions exist to be summed, not examined.

> Sessions roll up by the **local date they started on**. A session running 23:00 → 01:00 counts entirely toward the day it began — which is also how anyone working late thinks about it.

**Attribution to items.** A session usually covers several tasks, so the item link lives on the **segment**, not the session. Each work segment records what you were on, which is what makes "how long did this actually take" answerable — sum every segment carrying that item, across every session and every day.

**A segment can carry more than one item.** Working on two things at once is normal, so it's `itemIds`, a list. The consequence is that **per-item totals overlap and won't sum to the session total**: forty minutes spent on two items counts forty against each, not twenty. Splitting the time evenly would make the columns add up, but it would be a fiction — you didn't half-work on either. Stats shows the honest number and says so where the totals are displayed.

**Start the Day** opens a session; choosing what to work on happens inside it, and switching items just closes one segment and opens another.

**Session lifecycle:** `idle → work ⇄ break → ended`. A session is only ever live on one device, and per §6 the running timer is never synced — the completed session syncs once, after it ends.

### 2.7 Quick capture — one line in, a filled-in item out

Adding something should cost one sentence. You type or dictate **"Take the garbage out every 2 days important home"** and the app keeps _Take the garbage out_ as the title, sets a two-day recurrence, marks it important, files it under Home, and drops the words it used.

Two separate pieces, with very different risk:

- **The parser** — text to fields. Pure local logic, works offline, works for typed input too. This is the real feature.
- **Speech to text** — voice to text. A convenience layered on top, and the part with a caveat (below).

#### What it recognises

| Kind       | Examples                                                                 | Produces            |
| ---------- | ------------------------------------------------------------------------ | ------------------- |
| Recurrence | every day · daily · every 2 days · every Monday · every weekday · weekly | `rrule`             |
| Importance | important · `!`                                                          | `important: true`   |
| Project    | any existing project name · `#home`                                      | `projectId`         |
| Date       | today · tomorrow · next Friday · on 20 August · in 3 days                | `due` / `startDate` |
| Time       | at 17:00 · at 5pm · 14:30                                                | time on the date    |
| Block      | 2–4pm · from 2 to 4                                                      | `start` + `end`     |

Recurrence maps straight onto RFC 5545 — _every 2 days_ is `FREQ=DAILY;INTERVAL=2` — so nothing new enters the data model. **The parser adds no fields at all**: it's a pure function from text to an item you could have filled in by hand.

#### It must be a rule-based parser, not a model

No LLM call. The app is offline-first and self-hosted; capture has to work on a train with no signal, return instantly, and behave the same way every time. The grammar here is small and closed, which is exactly what hand-written rules are good at. `chrono-node` is worth using for the date and time half — it handles "next Friday at 5" well — with recurrence, importance and project matching hand-rolled on top.

The whole thing is one pure function, `parse(text, projects, now) → { title, fields, spans }`, which makes it the most testable code in the app: a table of inputs and expected outputs, no database, no clock beyond the `now` you pass in.

#### Matching anywhere, made safe by visibility

Modifiers are recognised **anywhere in the sentence**, not only at the end. That inevitably means some wrong reads — _"Call Mum about the important meeting"_ will claim the word _important_, and _"Buy home insurance"_ will file itself under Home — so the protection is not a restriction on where matches may occur, it's that **every match is visible and one tap undoes it**:

- the words the parser consumed stay **marked in place** in the text you typed
- each extracted value becomes a **chip you can tap off**, returning its words to the title
- nothing is ever silently rewritten

A parser that edits your words invisibly is worse than no parser. One that shows its work can afford to be aggressive, which is the trade being made here.

Three rules still apply, none of them positional:

1. **Whole words only** — never substrings, so _homework_ never matches the Home project.
2. **Longest match wins** — _every 2 days_ beats _every_.
3. **Never strip the whole title** — if removing matches would leave nothing, keep the text and drop the match.

#### Dictation runs on the device

A mic button on the capture field, feeding the same parser — dictation produces text, and the text is parsed exactly as if typed.

**Whisper via WASM**, not the browser's `SpeechRecognition`. Chrome's speech API uploads audio to Google's servers, which is the wrong default for an app whose whole premise is that your data stays on your own hardware. Whisper's multilingual models are also what make Turkish dictation work at all.

Practical consequences to plan for:

- **The model is a 75–145 MB download** (multilingual `tiny` to `base`). Fetch it lazily on first use, cache it in Cache Storage, and treat voice as opt-in — never something that downloads on install.
- **Threading needs cross-origin isolation.** WASM threads require `COOP`/`COEP` headers from the server, which affect the whole origin. Single-threaded transcription works without them and is simply slower — worth measuring before committing the server to isolation headers.
- Typed capture has none of these costs, so it ships first; voice follows without blocking anything.

#### Two languages now, more later

Turkish and English at launch, with the grammar **pluggable per locale** so a third is a new file rather than a change to the engine:

```
capture/
├── engine.ts            # matching, span tracking, title stripping — language-agnostic
├── grammars/
│   ├── en.ts            # keywords + chrono-node for dates
│   └── tr.ts            # keywords + hand-written date patterns
└── parse.ts             # runs every enabled grammar, merges the matches
```

**All enabled grammars run on every input** and their matches are merged, rather than a "capture language" setting deciding one. English and Turkish keywords barely collide, so this costs nothing and it means _"Take the garbage out her 2 günde bir"_ parses correctly — which is how bilingual people actually type.

> **`chrono-node` has no Turkish locale.** It ships English, French, Japanese, Dutch, Russian, Portuguese, Chinese and partial German/Spanish — Turkish isn't among them. So Turkish dates and times are hand-written work (_yarın_, _önümüzdeki Cuma_, _her 2 günde bir_, _saat 17:00'de_), not a library flag. That is the single largest piece of effort in this feature and it's worth knowing before it's scheduled.

> **Turkish lowercasing is a real trap.** `"I".toLowerCase()` is `"i"`, but the Turkish fold of `I` is `ı` — so a locale-aware `toLocaleLowerCase('tr')` and a plain `toLowerCase()` disagree on exactly the letters that appear in _İş_, _İkinci_, _Ilık_. Normalise both the input and the keyword tables through the _same_ fold, or matching fails on words that look identical on screen.

### 2.8 Settled

The product design is closed. Decisions that took more than one pass, recorded so they aren't reopened by accident:

| Question                    | Decision                                                                    |
| --------------------------- | --------------------------------------------------------------------------- |
| Urgency threshold           | one global `urgentWithinDays`, default **2 days**                           |
| Project filter scope        | **per screen** — Calendar, Tasks and Stats each keep their own              |
| Projects                    | a label and a filter. **No detail screen, no nesting**, managed in Settings |
| Order inside a matrix group | **manual**, via the fractional `sortOrder`                                  |
| Settings                    | a **gear in the Today header** — not a navbar slot                          |
| Stats                       | a **fourth navbar destination**, still linked from Effort mode              |
| Routine opt-out             | **no** — every recurring item goes to Routine, no exceptions                |

What remains is interface work still to draw (§3.8) and the engineering questions in §7.

---

## 3. Interface

### 3.1 Mobile shell

A bottom navbar with four destinations:

```
┌─────────────────────────────────┐
│                                 │
│                                 │
│           (screen)              │
│                                 │
│                                 │
├─────────────────────────────────┤
│ Calendar │ Today │ Tasks │ Stats│
└─────────────────────────────────┘
```

Today stays the default landing screen. Stats is a destination in its own right — the earlier plan hid it behind Effort mode to keep the navbar at three, but a screen you have to know a drill-down path to reach is a screen you stop opening.

**Effort mode still links into it**, and that link is not redundant: arriving from the calendar carries the month you were looking at, where the navbar always opens the current range.

**Settings lives behind a gear in the Today header** — the navbar stays at three. It holds:

| Group    | Contents                                                                |
| -------- | ----------------------------------------------------------------------- |
| Projects | create, rename, recolour, archive — the only place projects are managed |
| Planning | week start, `urgentWithinDays`, break nudge                             |
| Capture  | active languages, voice on/off and Whisper model download               |
| Sync     | server URL, auth token, sync state                                      |
| Data     | export                                                                  |

**View state resets on launch.** Calendar mode (§3.2) and each screen's filters are in-memory only: preserved while you move between tabs, back to defaults on a cold start. Nothing that changes what you _see_ is persisted, so the app can never open in a state you forgot you left it in.

**Filters are per screen, not global.** Calendar, Task view and Stats each keep their own project filter. Filtering the calendar to one project doesn't quietly filter your task list too — a single global filter you forgot was on is the kind of state that makes you think items have vanished.

### 3.2 Calendar view — the month grid

Fixed **6 rows × 7 columns = 42 cells**, always. Never five rows for one month and six for the next: a fixed grid means the layout never reflows, and swiping between months doesn't make everything jump. Leading and trailing days from the adjacent months fill the gaps, dimmed.

Items render as **bricks** — horizontal bars inside the day cells. An item spanning several days stretches across the columns it covers.

**Week-segmented spanning.** A brick can only stretch within one row. An item running Thursday → Tuesday draws as two segments — Thu–Sat in one week row, Sun–Tue in the next — each with an arrow on the cut edge showing it continues. This is how every month grid works, and it's the single largest piece of layout code in the app.

**Lane assignment.** Within a week row, bricks stack in fixed lanes so a bar holds the same vertical position across every day it spans. Per row: sort by start date, then longest-span first; give each item the lowest lane that's free across its whole span; single-day bricks fill the leftovers. Without this, spanning bars jump up and down mid-span.

**Overflow.** On a phone, a cell is roughly 95px tall, which fits about **three** bricks. Past that the cell shows `+N more`; tapping the day opens a day detail sheet with the full list.

**Navigation.** Swiping up/down moves through months, one month per gesture, with the adjacent months kept rendered so the motion is smooth. The header carries a month/year picker to jump anywhere, plus a "today" affordance to come back.

**Month is the only calendar layout.** No week or day view — which puts real weight on the day detail sheet, since it becomes the only place a day's items are seen in full. It should list them in time order and act as the de facto day view.

**Two modes: Plan and Effort.** A toggle in the header switches what fills the cells. Same grid, same month, two questions:

| Mode                 | Cells show                        | Answers                     |
| -------------------- | --------------------------------- | --------------------------- |
| **Plan** _(default)_ | bricks — scheduled items          | what am I meant to be doing |
| **Effort**           | intensity — focused work that day | what did I actually do      |

They're exclusive, and that's what makes it work. Effort mode isn't squeezed in beside the bricks — it takes the cell over completely, so intensity gets the full ~92px instead of fighting for a few spare pixels. Neither mode has to compromise: bricks keep all three slots, and intensity gets real room.

**Effort cell rendering**, as drawn in the prototype:

| Day           | Shows                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Worked        | hour figure above a bar, height and opacity both scaled against an 8-hour day |
| Past, no work | a thin flat track — present but empty                                         |
| Future        | nothing                                                                       |

The three states matter more than they sound. An earlier pass drew a dash on every workless day and the back half of the month read as a rendering failure rather than a month that hasn't happened yet.

This is the app's whole thesis as a single control — the plan and the follow-through, on the same grid, one tap apart.

**Mode is remembered within a run of the app, but not across launches.** Switch to Tasks and back and the calendar is as you left it; close the app and reopen it and you're in Plan. That falls out for free if the mode lives in plain in-memory state — a PWA resumed from the background keeps its memory, a cold start doesn't. Don't put it in settings or `localStorage`, or it will persist across launches and you'll have to write code to undo that.

**The project filter sits under the header**, in the same chip row Task view uses (§3.4): month picker and Plan/Effort toggle on the top line, project chips beneath.

> That row costs the grid roughly 32px, taking cells from ~97px down to ~92px. Checked against the prototype: the day number takes 22 and each lane 17, so **three bricks still fit**. The ceiling holds — but this row is now the reason it is exactly three, and any further growth in the header breaks it.

**Selected day.** One day is always selected, highlighted in the grid, defaulting to today. Tapping a day selects it. Selection is what the add button targets, and it persists as you swipe between months and across the mode toggle.

**Opening a day.** Tapping a day selects it and **slides a panel up from the bottom**, covering most of the screen: that day's items in time order in Plan mode, its sessions and totals in Effort mode. Drag it down, or tap the grid still visible above it, to dismiss — the day stays selected. `+N more` opens the same panel.

> Swipe-up remains month navigation. This is a _tap_, and the slide is the transition rather than the gesture, so the two never compete.

**Adding items.** A floating button at the **bottom right**, sitting above the navbar. It prefills the date:

| Opened from   | New item's date      |
| ------------- | -------------------- |
| Calendar view | the **selected day** |
| Task view     | **today**            |

Two placement constraints: it must clear the bottom navbar, and it needs a real inset from the screen edge. Android reads a back-swipe from **both** left and right edges by default, so neither corner escapes that — an edge-hugging button gets swiped instead of tapped either way.

> **The gesture conflict, and why overflow works the way it does.** Vertical swipe is taken by month navigation, so day cells _cannot_ scroll internally — the two gestures would fight and both would feel broken. That's what forces `+N more` plus a detail sheet instead of a scrollable cell, and it means the grid must fit the viewport exactly, with no page scroll of its own. Everything about the month view follows from this one constraint.

**Brick appearance** has to carry four independent signals at once, so each needs its own visual channel:

| Signal                     | Channel                             |
| -------------------------- | ----------------------------------- |
| Project                    | fill colour                         |
| Timed / all-day / deadline | shape — solid bar, soft bar, marker |
| Done or cancelled          | dimmed + strikethrough              |
| Missed                     | accent border or icon               |

Project colour is already spoken for, so status can't also be colour. Keep these on separate channels or bricks become unreadable at a glance.

### 3.3 Today screen

```
┌─────────────────────────────────┐
│  Today · Thursday 14 August     │
├─────────────────────────────────┤
│  MISSED                         │
│   Write the report  yesterday   │
│   Call the bank     3 days ago  │
│   Renew licence     last week   │
│   See all 12  →                 │
│  EVENTS                         │
│   Standup              09:00    │  ← own scroll
│   Dentist              14:30    │
│  DUE TODAY                      │
│   Invoice                       │
│  ANYTIME                        │
│   Read the spec                 │
│   See all 41  →                 │
├─────────────────────────────────┤
│      ▶  START THE DAY           │
├─────────────────────────────────┤
│  Calendar  │  Today  │  Tasks   │
└─────────────────────────────────┘
```

**Grouped, and every group capped at three.** Past three, the group ends with a **See all N →** row that opens Task view filtered to that group. Today is a launchpad, not a backlog — it should stay glanceable no matter how far behind you are.

Groups, in order:

| Group         | Contains                         | Row detail                           |
| ------------- | -------------------------------- | ------------------------------------ |
| **Missed**    | open items whose time has passed | how late — `yesterday`, `3 days ago` |
| **Events**    | timed events today               | start time                           |
| **Due today** | deadlines falling today          | time if it has one                   |
| **All day**   | all-day items covering today     | —                                    |
| **Anytime**   | unscheduled items                | —                                    |

The cap bounds the whole screen at roughly twenty rows however bad things get, which is what stops a neglected backlog from turning Today into something you scroll past. It also subsumes the recurring-item problem from §2.7: a daily task skipped for three weeks contributes at most three rows to Missed, not twenty-one, so no special-casing of series is needed.

This does require **Task view to accept a filter from a link** — "missed", "due today", "anytime" — since that's where every See all lands.

**The list scrolls; the button doesn't.** Start the Day is pinned above the navbar and always reachable no matter how long the list gets. The list scrolls inside its own region rather than the page scrolling as a whole.

**Start the Day opens the day's session** (§2.6) and hands straight over to Work Mode. Choosing what to work on happens in there, not before. If a session is already running, the button becomes a way back into it.

### 3.4 Task view

The same items as the calendar, listed rather than laid out in time. Where the calendar answers _when_, this answers _what matters_.

**Grouping is fixed — the Eisenhower matrix, plus Daily:**

1. **Routine**
2. **Urgent & Important**
3. **Important, Not Urgent**
4. **Urgent, Not Important**
5. **Neither**

Always these five, always in this order, whatever the filter. Grouping expresses _importance_; filters narrow _which items are shown_. Two independent axes, which is what makes the screen work: you can filter to one project or to this week and still see the matrix inside it.

**Routine is derived, not assigned: any item that recurs.** `rrule !== null` and it goes there — every 2 days, every Monday, monthly, whatever the frequency. No stored flag, no extra UI, no threshold to argue about.

Routine items appear **only** in that group, never also in a quadrant. That exclusion is the point: recurring things come back forever, so left in the matrix they would permanently occupy it, and a top quadrant filled with _take out the rubbish_ and _read 20 pages_ is what stops an Eisenhower view being worth opening. Routine keeps the four quadrants about decisions.

> **The consequence: nothing recurring is ever classified.** A monthly report that genuinely is urgent and important still sits under Routine, not in the top quadrant. That's the cost of a clean rule, and it's survivable because Today surfaces recurring items through **Due today** and **Missed** regardless of this grouping — the matrix is for deciding, Today is for doing. If it ever chafes, the escape hatch is letting an item opt out of Routine with a stored flag.

**New items default to `important: false`**, so anything captured quickly lands in **Neither** until you say otherwise. No Unclassified group; the bottom quadrant _is_ the unclassified bucket.

> Worth knowing this is safer than it looks: because urgency is derived, an unclassified item that carries a due date climbs into **Urgent, Not Important** on its own as the deadline nears. Only genuinely undated, unimportant items stay at the bottom — which is where they belong.

**This replaces `priority: 0 | 1 | 2`.** The old field is gone from the model (§6) — the matrix says the same thing in a form you can actually apply, since "is this important" and "is this urgent" are answerable questions where "is this a 1 or a 2" is not.

**Urgency is derived from the due date, not stored.** An item is urgent when its deadline falls inside `urgentWithinDays` — **one global number, default 2 days**, set in Settings. Only `important` is a stored flag.

> This matters more than it looks. Urgency is a fact about _time_, so a stored urgency flag is wrong the moment the clock moves — something you marked "not urgent" three weeks ago is urgent now, and the app would have no idea. Deriving it means items migrate from **Important, Not Urgent** into **Urgent & Important** on their own as deadlines approach, which is the exact behaviour the matrix is supposed to teach. It's the same principle as _missed_ in §2.2: never store what the clock can tell you.
>
> It also means an item with no due date is never urgent — which is correct by definition, not a limitation.

**Row layout:**

```
○   Write the quarterly report
    Due tomorrow · 14:00
```

- **Circle checkbox on the left.** Tapping it completes the item. That is all it does — no menu, no confirm, no side effects.
- **Title**, with a **sub-line** underneath showing when it's due.
- Tapping **anywhere else on the row** opens the detail sheet from the bottom — the shared item editor (§8), where cancelling, rescheduling, projects, subtasks and recurrence live.

**Filters sit in two rows, one per axis**, because they are independent and combine:

```
┌──────────┬────────┬───────────┬──────┐
│ All time │ Missed │ This week │ Done │   ← time
└──────────┴────────┴───────────┴──────┘
 (•All projects) (•Corvonium) (•Thesis) …  ← project, scrolls sideways
```

Four equal buttons for time; project chips below, each carrying its colour dot. A single scrolling strip of everything hid the fact that the two are separate axes rather than one list of alternatives.

**Completed items appear only under the Done filter.** Never inline, never greyed at the bottom of a group. The default view is work that remains.

**Ordering inside a group is manual** — drag to arrange, held in `sortOrder`. This is what the fractional index in §6 exists for: reordering on two devices produces keys _between_ neighbours instead of colliding integers.

> `sortOrder` is one continuous ordering across all items, which each group then filters. That matters because groups aren't fixed: an item crosses from **Important, Not Urgent** into **Urgent & Important** on its own as its deadline nears, and a single global order means it arrives already positioned relative to what's there — rather than landing at an arbitrary spot because each group kept its own numbering.

New items enter at the **top** of their group, where you can see what you just captured.

### 3.5 Work Mode screen

Takes over the screen once a session is running. Three regions, following Continuum:

```
┌─────────────────────────────────┐
│           TOTAL                 │
│         00:47:12                │  ← whole session, counts up
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │        ( WORK )           │  │  ← current segment
│  │        00:12:04           │  │
│  │   Write the invoice       │  │  ← item being worked on
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  ● Work   Invoice      00:35    │
│  ● Break               00:08    │  ← segment history
│  ● Work   Invoice  live 00:12   │
├─────────────────────────────────┤
│      [  Take a Break  ]         │
│      [  Switch item   ]         │
│      [  End Session   ]         │
└─────────────────────────────────┘
```

The one addition over Continuum is the **item**: the current segment names what you're working on, the history shows it per row, and **Switch item** closes the current segment and opens a new one against a different item — without taking a break. Picking from today's list is the obvious source. More than one item can be attached to a segment at a time.

**Ticking an item off inside Work Mode does nothing to the clock.** It doesn't end the segment, doesn't end the session, doesn't prompt anything. Completion and timing are independent: you might finish six items in one segment, or run two at once for an hour. The timer tracks _time_; the checkbox tracks _state_; neither drives the other.

**Session summary** on End Session, again following Continuum: focus ring with the percentage, tiles for work total / break total / focus % / segment count, and a Done button. Corvonium adds a **per-item breakdown** — where the time actually went — which is the whole payoff of tracking items and time in one app.

**Everything on that screen is computed from the segment list.** Nothing is a stored counter, which means a session reopened later shows identical numbers and there is no total that can drift out of sync with its parts.

### 3.6 Stats screen

The detailed view behind Effort mode. Where the calendar answers "which days did I work", this answers "where did the time actually go".

A navbar destination (§3.1), and also reachable by tapping the summary strip in Effort mode — which carries the month you were looking at, rather than resetting to the current one.

Contents:

- **Range selector** — week / month / custom, with the project row beneath it, laid out exactly as Task view's filters (§3.4)
- **Totals** — work, break, focus % for the range
- **Per project** — where the hours went, the payoff of `projectId` on items and `itemIds` on segments
- **Per item** — the biggest time sinks in the range, labelled as overlapping since a segment can carry several items
- **Focus % over time** — whether the trend is going the right way
- **Day totals** — the base unit everything else aggregates from

The **day** is the smallest bucket anywhere in Stats. Sessions are summed into days, days into weeks and months; no view breaks a day down by hour or by session, because that's not the question the app is trying to answer.

**All of it is computed from `sessions` on read** — no rollup tables, no aggregate documents, no nightly summarisation job. A few sessions a day is on the order of a thousand documents a year, which is nothing to aggregate in memory, and derived stats can never drift out of step with the sessions they describe. Introducing a rollup table would add a second source of truth for numbers that are cheap to just compute.

Day-level detail follows the same path: tapping a day in Effort mode opens the day sheet showing that day's sessions and summary, exactly as tapping it in Plan mode shows that day's items.

### 3.7 Add sheet — capture

The add button opens a sheet whose first control is a single text field with a **mic** beside it. Parsing runs as you type or as dictation lands, and the result appears underneath as chips:

```
┌───────────────────────────────────────────┐
│  Take the garbage out every 2 days         │
│  important home                       🎤  │
│  ─────────────────  ───────── ────         │  ← matched words, marked
├───────────────────────────────────────────┤
│  ( Every 2 days ✕ ) ( Important ✕ )        │
│  ( ● Home ✕ )                              │
├───────────────────────────────────────────┤
│  Title    Take the garbage out             │
│  Repeat   Every 2 days                     │
│  Project  Home                             │
│  Important ●                               │
│                                            │
│  [ More options ]          [    Add    ]   │
└───────────────────────────────────────────┘
```

**Both the input and the result stay visible.** The words the parser consumed are marked in place in the raw text, and each extracted value is a chip you can tap off — putting the words back into the title. You always see what it did, and undoing a wrong read costs one tap.

The fields below are the ordinary item form, pre-filled. Nothing about capture is a separate path: it fills in the same form you could have filled in yourself, so a parse you dislike is just a form you edit.

### 3.8 Desktop

Same views, a different shell — and two things become genuinely better rather than merely bigger.

**A top bar replaces the bottom navbar.** Name at the left, the three destinations beside it, sync state and settings at the right. Month navigation becomes arrow buttons, since there is no swipe to spend.

**The matrix becomes an actual matrix.** On a phone the Eisenhower groups have to stack vertically. With width they can be laid out as the 2×2 they actually describe — urgent along one axis, important along the other — with Routine as a strip above. This is the one place the desktop version is better rather than roomier: the grid _position_ carries the meaning that the stacked list has to spell out in headers.

**Bottom sheets become side panels.** The day detail and the item editor slide in from the right, so the calendar or list stays visible beside what you're editing.

**The overflow ceiling mostly dissolves.** A desktop cell fits eight or more bricks, so `+N more` becomes rare instead of routine. It still has to exist, and the day panel is still where a full day gets read — but the constraint that shapes the whole mobile calendar stops being the thing that shapes this one.

**Everything else is unchanged.** Same data, same derived state, same components underneath. The shell differs; nothing below it does.

### 3.9 Still to design

- The full add/edit item form — the one surface every screen shares, currently drawn only in its pre-filled capture state
- The Settings screens themselves (§3.1 fixes where they live, not what they look like)
- Empty states — a fresh install, a day with nothing on it, a project with no items
- Drag-to-schedule: what dragging an item onto a day actually does to its fields

---

## 4. The Stack

| Layer                              | Choice                            | Role                                                                                             |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Language                           | **TypeScript**                    | Everywhere                                                                                       |
| Frontend                           | **React + Vite**                  | UI, built as an installable PWA                                                                  |
| Styling                            | **Tailwind CSS**                  | Utility-first styling                                                                            |
| Local DB / sync engine             | **RxDB**                          | Reactive local database (IndexedDB), change tracking, replication                                |
| Sync server                        | **Node.js + Fastify**             | Small TS service exposing pull/push replication endpoints                                        |
| Server DB                          | **SQLite** (via `better-sqlite3`) | Single-file storage behind the sync server                                                       |
| Dates                              | **date-fns**                      | Calendar math                                                                                    |
| Recurrence                         | **rrule**                         | RFC 5545 rule parsing + occurrence expansion                                                     |
| Capture parsing                    | **chrono-node** (English only)    | Natural-language dates; Turkish dates, recurrence, project and importance all hand-rolled (§2.7) |
| Dictation                          | **Whisper via WASM**              | On-device transcription, multilingual, no audio leaves the phone                                 |
| Ordering                           | **fractional-indexing**           | Conflict-tolerant manual sort order                                                              |
| Desktop wrapper _(later)_          | **Tauri**                         | Native desktop app around the same React code                                                    |
| Mobile wrapper _(later, optional)_ | **Capacitor**                     | Only if PWA notification limits bite                                                             |
| Deployment _(later)_               | **Docker + Caddy**                | Containerized server + reverse proxy with auto-TLS                                               |
| Remote access _(later)_            | **WireGuard / Tailscale**         | Sync from outside LAN without exposing ports                                                     |

### Alternatives considered

- **PouchDB + CouchDB** — least sync code (replication built into protocol), but you inherit CouchDB's document/revision model and run CouchDB itself.
- **PowerSync / ElectricSQL** — polished Postgres↔SQLite sync, heavier self-hosting footprint.
- **Replicache / Zero** — excellent mutator-based model, more upfront concepts.
- **Flutter** — one codebase everywhere, but heavyweight web output and Dart is less transferable.
- **Electron** instead of Tauri — mature but ships a full Chromium per app.
- **PostgreSQL** instead of SQLite — switch later only if multi-user or heavy query needs appear.

---

## 5. System Topology

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

## 6. Data Model

All collections share sync-friendly fields. **Rules that everything depends on:**

- `id`: **UUID v4, generated on the client** (never server auto-increment — records are created offline).
- `createdAt`: epoch millis, set once. Never changes.
- `updatedAt`: epoch millis, set on every mutation. Used for last-write-wins conflict resolution.
- **Never hard-delete.** Deleting sets a tombstone that syncs like any other change. Use **RxDB's built-in `_deleted`** via `doc.remove()` rather than a field of our own: queries exclude tombstones automatically, and the replication protocol already propagates them. (`deleted` is a reserved field name in RxDB for exactly this reason.) Optionally purge tombstones server-side once every client has seen them, e.g. after 30+ days.

### `items` — tasks _and_ events

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
  location: string | null,
  important: boolean,            // the Eisenhower axis that is a judgement call; defaults false
  sortOrder: string,             // fractional index — conflict-tolerant manual ordering

  createdAt: number,
  updatedAt: number
  // no `deleted` field — RxDB's built-in `_deleted` tombstone handles it
}
```

**Notes on the shape:**

- **All-day items are dates, not instants.** Storing UTC-midnight millis and rendering in local time shifts them a day for negative UTC offsets. Hence the separate `startDate`/`endDate` strings.
- **There is no `missed` field, and no `urgent` field.** Both are queries. Missed is `status === 'open'` and the item's time has passed; urgent is a due date inside `urgentWithinDays`. Storing either would need a background job to flip it — exactly the kind of thing that breaks on a device that was asleep, offline, or in another timezone. Only `important` is stored, because only `important` is a judgement rather than a fact about the clock.
- **There is no `priority`.** The Eisenhower grouping in §3.4 replaced it.
- **`cancelled` ≠ `deleted`.** Cancelled is a real outcome the user chose and it stays visible in history. `deleted` is a tombstone meaning the record shouldn't exist at all.
- **Recurrence is expanded at render time** with the `rrule` library — never materialize every occurrence as a row. Completing, cancelling, or editing a single occurrence creates an override item carrying `seriesId` + `originalStart`. _("This and all following" edits still need a decision — see Open Questions in §7.)_
- **`sortOrder` is a string, not a number.** Numeric order breaks under last-write-wins: two devices reordering produce ties and duplicates. Fractional indexing generates a key _between_ two neighbours, so reorders never renumber and never collide.

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
  updatedAt: number
}
```

> Own collection rather than an array on the item, so concurrent ticks on two devices merge instead of clobbering each other. Costs one extra query in the item editor and one more collection in the replication loop.

### `projects`

A project is a **label and a filter, nothing more** — no detail screen, no nesting, no per-project settings. Created and managed in Settings; used as a colour on the calendar and as a filter chip on Task view, Calendar and Stats.

```ts
{
  id: string,
  name: string,
  color: string | null,
  archived: boolean,
  sortOrder: string,
  createdAt: number,
  updatedAt: number
}
```

### `sessions` — recorded work

One document per session, with its segments embedded.

```ts
{
  id: string,
  startedAt: number,
  endedAt: number | null,       // null while running
  segments: [
    {
      kind: 'work' | 'break',
      itemIds: string[],        // what was being worked on — may be several at once
      startedAt: number,
      endedAt: number | null    // null on the live segment
    }
  ],
  createdAt: number,
  updatedAt: number
}
```

**No stored totals.** No `durationSec`, no work/break sums, no focus percentage, no segment count — all of it is arithmetic over `segments`, computed on read. A stored total is a number that can disagree with its own parts after an edit or a partial sync; derived totals can't.

> **Segments are embedded here, unlike subtasks.** The rule is who writes them and when. A checklist is edited on any device, forever, so its entries must be separate documents to merge. A session is appended to by exactly one device, then frozen — no second writer ever exists, so there is nothing to merge and an array is simply the honest shape.

> **The running timer is never synced.** It is local state until the session ends. Render every clock from `startedAt` and the wall clock (`elapsed = now - startedAt`), never from an accumulating `setInterval` counter — that's what makes the timer survive tab suspension, phone sleep, and app restarts. Counting _up_ rather than down makes this easier than it was in the pomodoro model: there's no target to overshoot while the device was asleep.

### `settings` (synced app preferences)

```ts
{
  id: "settings",
  weekStartsOn: 0 | 1,
  urgentWithinDays: number,            // default 2 — deadline inside this window is urgent (§3.4)
  breakNudgeAfterMin: number | null,   // optional "you've worked a while" nudge; null = never
  createdAt: number,
  updatedAt: number
}
```

### Device config (local only, **never synced**)

Server URL, auth token, notification permissions, theme. These live in `localStorage` (or an unreplicated RxDB collection), because you cannot sync the settings that tell you how to sync — and because they are genuinely per-device.

---

## 7. Sync Design

### Protocol (RxDB replication)

RxDB replicates each collection via HTTP endpoints **you implement** on the Fastify server:

- **Pull** — `GET /sync/:collection/pull?checkpoint=...&limit=...`
  Returns documents changed since the client's checkpoint, plus a new checkpoint.
- **Push** — `POST /sync/:collection/push`
  Client sends its changed docs (each with the assumed previous state). Server detects conflicts, applies winners, returns the conflicting docs so the client can re-merge.
- **Live stream (optional but nice)** — `GET /sync/stream` via **Server-Sent Events**.
  Server emits "something changed" pings; clients re-pull immediately instead of polling. This is what makes an edit on desktop appear on the phone within a second.

### Server-side storage

One SQLite table per collection mirroring the document shape, plus indexes for checkpoint queries. The server is _dumb by design_: it stores documents, orders them by change time, and relays them. All app logic lives in clients.

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
7. ~~**Schema migrations**~~ — **done in Phase 0.** RxDB collections are declared at `schemaVersion: 0` with `migrationStrategies` wired. The SQLite migration runner is still owed, in Phase 2.

---

## 8. Frontend Architecture

```
apps/web/src/
├── db/
│   ├── schema/            # RxDB collection schemas (items, subtasks, projects, sessions, settings)
│   ├── database.ts        # getDatabase() — lazy singleton, dev-only validator + dev-mode
│   ├── hooks.ts           # reactive query hooks; the impure edge (clock, uuid) lives here
│   └── replication.ts     # per-collection replication setup, server URL from device config
├── features/
│   ├── calendar/          # month grid, lane assignment, Plan/Effort modes, rrule expansion
│   ├── tasks/             # the Eisenhower matrix, filters, triage
│   ├── today/             # capped groups, Start the Day
│   ├── work/              # work mode surface, session state machine, segment recording
│   ├── stats/             # ranges, per-project and per-item rollups
│   ├── capture/           # the text parser (§2.7) + dictation — pure, unit-tested
│   └── projects/          # project management, inside Settings
├── components/            # shared UI (buttons, sheets, layout)
├── lib/                   # formatting, useNow, ordering, notification helpers
├── App.tsx
└── main.tsx
```

`packages/shared/` holds what the server needs too: the document types, the RxDB schemas, the sync wire types, and the derived predicates (§10).

Guidelines:

- **The database is the state manager.** No Redux/Zustand for domain data — components subscribe to RxDB queries directly (thin hooks like `useItems(filter)`). Keep component-local state (open dialogs, form drafts) in React state.
- **Exactly one place reads the clock.** A `useNow()` hook holds the current time as state and ticks once a minute; every component that needs it receives it, and every predicate takes `now` as an argument. Calling `Date.now()` inside a render is impure — React only re-renders for its own reasons, so the value goes stale and **§2.2's promise that missed "updates itself as the clock moves" quietly stops being true at midnight**. It also keeps the derived state testable, since a function given the time can be tested with a table.
- **One item editor**, shared by all three screens. Since tasks and events are one type, there is one edit surface; the screens differ in how they _list_ items, not how they _edit_ them.
- **Work mode as a state machine:** `idle → work ⇄ break → ended`, driven entirely by the user rather than by elapsed time. Persist the in-progress session locally so a reload or app restart resumes it exactly — the segment list plus wall-clock arithmetic is all the state there is.
- **Notifications:** use the Notification API + service worker. Works well on desktop and Android; iOS PWA background notifications are unreliable — the eventual argument for Capacitor. _(Scheduled due-date reminders need a real decision — browsers can't reliably schedule future local notifications.)_

### PWA specifics

- **Service worker** via `vite-plugin-pwa` (Workbox under the hood): precache the app shell so it boots with zero network.
- **Web app manifest**: name, icons, `display: standalone`, theme color → installable on phone home screen.
- App data lives in IndexedDB, _not_ the service worker cache — the SW only caches code/assets.
- Request **persistent storage** (`navigator.storage.persist()`) to reduce eviction risk on mobile.

---

## 9. Server Architecture

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

## 10. Engineering Setup

### Repository layout

```
corvonium/
├── apps/
│   ├── web/                        # React + Vite PWA
│   └── server/                     # Fastify + SQLite sync hub
├── packages/
│   └── shared/                     # the contract both sides import
├── design/
│   └── corvonium-screens.html      # the interface prototype
├── pnpm-workspace.yaml
└── package.json
```

**pnpm workspaces, with a shared package that carries real weight.** "One language everywhere" only pays for itself if both sides import the _same_ definitions instead of each keeping a copy that quietly drifts. `packages/shared` holds:

- TypeScript types for every document
- the RxDB JSON schemas, derived from those types
- the sync wire types — pull/push request and response shapes, and the checkpoint
- the derived-state predicates: `isMissed`, `isUrgent`, `isRoutine`

Those predicates matter more than they look. Missed, urgent and routine are computed in several places — Today's groups, the matrix, the filters — and one definition imported everywhere is what stops the calendar and the task list disagreeing about whether something is overdue.

### Testing

The parts most likely to break are pure functions, which is fortunate: they're the cheapest things to test.

**Unit, no database:**

- the capture parser — table-driven, both languages, one row per phrase
- recurrence expansion, including DST boundaries and "this and all following"
- brick lane assignment across week boundaries
- the derived predicates, at their threshold edges
- fractional ordering under concurrent inserts

**Sync scenarios — two RxDB instances against an in-memory server.** These are what let you refactor sync later without fear, and they are exactly the tests that never get written by accident:

| Scenario                                | Should                                                  |
| --------------------------------------- | ------------------------------------------------------- |
| Same item edited on two clients         | one wins; neither is lost silently                      |
| Delete on A, edit on B                  | tombstone and edit resolve deterministically            |
| Client offline three days, then pushes  | other clients receive it — this is the `serverSeq` test |
| Reorder on both clients                 | no duplicate or colliding `sortOrder`                   |
| One client's clock five minutes fast    | it doesn't win every conflict                           |
| Checkpoint older than the purge horizon | forces a full resync; nothing resurrects                |

### Import and export

JSON export of every collection, and restore from it. Cheap to build, and it's the insurance policy against your own schema mistakes — the thing that lets you keep changing the model while real data is already in it. `.ics` export later, if calendar interop ever matters.

### Search

In-memory filtering over `items`. At a few thousand documents this is instant, needs no index and adds no dependency. Revisit only when it stops being instant.

### To confirm before depending on them

- **RxDB storage licensing.** Phase 1 runs on the IndexedDB/Dexie storage; some storages and performance plugins are Premium. Check which tier the ones you want sit in _before_ the Tauri phase depends on one.
- **Whisper's real cost** — model size and single-threaded speed on your actual phone, measured before deciding whether cross-origin isolation is worth imposing on the whole origin.

### Notifications — the decision that reshapes the server

| Approach                      | Reach                               | Cost                                                                                  |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| None — in-app only            | works today                         | no reminder while the app is closed, which is exactly when you need one               |
| Web Push + server scheduler   | desktop, Android, installed iOS PWA | VAPID keys, a subscription store, and a scheduler on the server — it stops being dumb |
| Capacitor local notifications | reliable everywhere                 | pulls Phase 5 forward to Phase 3                                                      |

Phases 1–3 can ship without scheduled reminders. The decision has to land before Phase 3 closes, because the second option changes what the server _is_, and the third changes when it gets wrapped.

---

## 11. Build Phases

**Phase 0 — Foundations** ✅ _complete_
pnpm workspaces, `packages/shared`, TypeScript config, lint and format, a test runner, CI. RxDB collections declared at `schemaVersion: 0` with `migrationStrategies` wired from the first commit, and the SQLite migration runner in place before there is anything to migrate. Nothing user-facing ships here; everything after it costs less because of it.

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

## 12. Pitfalls Checklist

- [ ] Client-generated UUIDs everywhere — no server-assigned IDs
- [ ] Tombstones via RxDB's `_deleted` (`doc.remove()`) — no hard deletes, and never a `deleted` field of your own (reserved name)
- [ ] `updatedAt` set on **every** mutation, including tombstoning; `createdAt` never changes
- [ ] Store timed values in UTC (epoch millis); store all-day values as `YYYY-MM-DD` strings
- [ ] Keep `tzid` on anything recurring — DST and travel break naive UTC expansion
- [ ] `sortOrder` is a fractional-index string, never an integer
- [ ] "Missed" and "urgent" are derived from the clock, never stored flags or a nightly job
- [ ] `cancelled` is a status, not a deletion — cancelled items stay in history
- [ ] Subtasks are documents, not an embedded array — embedded checklists lose concurrent ticks
- [ ] Completing one occurrence of a recurring item writes an override, not a mutation of the series
- [ ] Timers computed from `startedAt` + wall clock, never from accumulating interval ticks
- [ ] Never sync the live session — only completed ones
- [ ] Session totals, focus %, and all Stats figures are derived from `sessions` on read — no rollup tables, no summarisation job
- [ ] Time is attributed per **segment**, not per session — one session spans many items
- [ ] Sessions roll up by the local date they **started** on; the day is the smallest reporting bucket
- [ ] Per-item time overlaps by design (a segment can carry several items) — label it, don't divide it
- [ ] Every list on Today is capped at three rows plus a **See all** link
- [ ] Capture never edits the title invisibly — consumed words stay marked, every match is one tap to undo
- [ ] Capture parsing is rule-based and offline — no network call between typing and an item existing
- [ ] Turkish text folded with the **same** casing function on both input and keyword tables (`I`/`ı`/`İ`/`i`)
- [ ] Whisper's model is fetched lazily on first use, never bundled or downloaded at install
- [ ] Server URL + auth token in **local-only** device config, never in the synced settings doc
- [ ] Checkpoint on a server-assigned sequence, not on client `updatedAt`
- [x] Declare RxDB `schemaVersion` + migration strategies before storing real data — _done, Phase 0_
- [ ] Month grid sized with `dvh`, not `vh` — mobile browser chrome collapses and `100vh` overflows
- [ ] Request persistent storage in the PWA
- [ ] Back up the server's SQLite file regularly — and test a restore once
