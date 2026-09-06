# PRD: WaCrawl Dashboard — WhatsApp Analytics Web App

**Version:** 1.0  
**Date:** 2026-05-12  
**Author:** Personal project  
**Status:** Ready for implementation in Cursor

---

## 1. Overview

### 1.1 Purpose
A local web application that reads the `~/.wacrawl/wacrawl.db` SQLite archive (produced by the `wacrawl` CLI) and presents the user's WhatsApp history as an interactive analytics dashboard with rich charts, media insights, and a powerful search interface.

### 1.2 Goals
- Turn a raw SQLite archive into an explorable, beautiful personal dashboard.
- Zero cloud dependency — everything runs locally, data never leaves the machine.
- Fast: all queries hit a local SQLite file; the UI must feel instant.
- Single-user, no authentication required (localhost only).

### 1.3 Non-Goals
- Sending messages or interacting with WhatsApp in any way.
- Modifying `wacrawl.db` or WhatsApp's own databases.
- Mobile / responsive design (macOS desktop browser only).
- Multi-user accounts.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast HMR, modern tooling |
| Styling | Tailwind CSS v3 + shadcn/ui | Rapid, consistent design system |
| Charts | Recharts | First-class React integration, composable |
| Backend | Node.js + Express + TypeScript | Lightweight, same language as frontend |
| DB driver | `better-sqlite3` | Synchronous, fast, ideal for local SQLite |
| State mgmt | Zustand | Minimal, no boilerplate |
| Routing | React Router v6 | Standard SPA routing |
| Date utils | date-fns | Lightweight, tree-shakeable |
| Icons | Lucide React | Consistent with shadcn/ui |

---

## 3. Project Structure

```
wacrawl-dashboard/
├── apps/
│   ├── api/                        # Node.js + Express backend
│   │   ├── src/
│   │   │   ├── index.ts            # Server entry point
│   │   │   ├── db.ts               # better-sqlite3 singleton
│   │   │   ├── routes/
│   │   │   │   ├── stats.ts        # /api/stats/*
│   │   │   │   ├── chats.ts        # /api/chats/*
│   │   │   │   ├── messages.ts     # /api/messages/*
│   │   │   │   ├── contacts.ts     # /api/contacts/*
│   │   │   │   ├── media.ts        # /api/media/*
│   │   │   │   └── search.ts       # /api/search
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/                        # React + Vite frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx   # Main analytics dashboard
│       │   │   ├── Chats.tsx       # Chat list + drill-down
│       │   │   ├── People.tsx      # Contact analytics
│       │   │   ├── Media.tsx       # Photo/video/file explorer
│       │   │   └── Search.tsx      # Global search page
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   └── TopBar.tsx
│       │   │   ├── charts/
│       │   │   │   ├── ActivityHeatmap.tsx
│       │   │   │   ├── TopContactsBar.tsx
│       │   │   │   ├── MessageVolumeArea.tsx
│       │   │   │   ├── MediaBreakdownPie.tsx
│       │   │   │   ├── HourOfDayBar.tsx
│       │   │   │   ├── DayOfWeekBar.tsx
│       │   │   │   ├── SentVsReceived.tsx
│       │   │   │   └── WordCloud.tsx
│       │   │   ├── search/
│       │   │   │   ├── SearchBar.tsx
│       │   │   │   ├── SearchResults.tsx
│       │   │   │   └── FilterPanel.tsx
│       │   │   └── ui/             # shadcn/ui re-exports
│       │   ├── hooks/
│       │   │   ├── useStats.ts
│       │   │   ├── useSearch.ts
│       │   │   └── useDateRange.ts
│       │   ├── store/
│       │   │   └── appStore.ts     # Zustand global state
│       │   ├── api/
│       │   │   └── client.ts       # Typed fetch wrappers
│       │   └── lib/
│       │       └── utils.ts
│       ├── index.html
│       ├── vite.config.ts
│       └── tsconfig.json
├── package.json                    # Root monorepo (npm workspaces)
└── README.md
```

---

## 4. Database Schema Reference

The backend reads `~/.wacrawl/wacrawl.db`. Key tables (already populated by `wacrawl sync`):

```sql
-- Core tables (read by wacrawl from WhatsApp's ChatStorage.sqlite)
chats             (id, jid, name, is_group, last_message_time, message_count)
contacts          (id, jid, name, phone, push_name)
messages          (id, chat_id, sender_jid, text, timestamp, from_me, has_media)
media             (id, message_id, chat_id, media_type, file_path, file_size, caption)
groups            (id, jid, name, participant_count, creation_time)
group_participants(id, group_jid, participant_jid, is_admin)
```

> **Note for Cursor:** Confirm exact column names by running `PRAGMA table_info(<table>)` on the live DB during development. The schema above reflects the wacrawl source code; minor column name variations are possible.

---

## 5. Backend API Specification

### Base URL
`http://localhost:3001/api`

### 5.1 Stats Routes — `GET /api/stats`

#### `GET /api/stats/overview`
Returns top-level summary numbers for the dashboard header.

**Response:**
```json
{
  "totalMessages": 142500,
  "totalChats": 312,
  "totalContacts": 284,
  "totalMediaFiles": 18200,
  "oldestMessage": "2018-03-12T10:00:00Z",
  "newestMessage": "2026-05-11T23:58:00Z"
}
```

#### `GET /api/stats/top-contacts`
**Query params:** `period` (day | week | month | year | all), `limit` (default 10), `type` (sent | received | all)

Returns the contacts you message most within the given period.

**Response:**
```json
[
  { "jid": "...", "name": "Alice", "messageCount": 4821, "sentByMe": 2100, "sentByThem": 2721 }
]
```

#### `GET /api/stats/message-volume`
**Query params:** `period` (week | month | year | all), `granularity` (day | week | month)

Returns time-series message counts for the volume area chart.

**Response:**
```json
[
  { "date": "2026-01-01", "sent": 45, "received": 112 }
]
```

#### `GET /api/stats/activity-heatmap`
**Query params:** `year` (default: current year)

Returns message count per day for the GitHub-style heatmap.

**Response:**
```json
[
  { "date": "2026-01-15", "count": 87 }
]
```

#### `GET /api/stats/hour-of-day`
**Query params:** `period`

Returns message counts bucketed by hour (0–23) for the "when are you most active" bar chart.

**Response:**
```json
[{ "hour": 0, "count": 12 }, { "hour": 1, "count": 8 }, ...]
```

#### `GET /api/stats/day-of-week`
**Query params:** `period`

Returns message counts by weekday (0 = Monday … 6 = Sunday).

#### `GET /api/stats/media-senders`
**Query params:** `period`, `media_type` (photo | video | audio | document | all), `limit`

Returns contacts who send the most media.

**Response:**
```json
[
  { "jid": "...", "name": "Bob", "photoCount": 312, "videoCount": 88, "audioCount": 5, "documentCount": 21 }
]
```

#### `GET /api/stats/media-breakdown`
**Query params:** `period`

Returns total count per media type for the pie chart.

**Response:**
```json
{ "photo": 9200, "video": 3100, "audio": 840, "document": 560, "sticker": 4400 }
```

#### `GET /api/stats/response-times`
**Query params:** `period`, `chat_jid` (optional)

Returns average response time in minutes per contact (top 20). Calculated as the median time between an incoming message and the next outgoing message in the same chat.

**Response:**
```json
[
  { "jid": "...", "name": "Carol", "avgResponseMinutes": 4.2 }
]
```

#### `GET /api/stats/group-activity`
**Query params:** `period`, `limit`

Returns top most-active groups by message count.

#### `GET /api/stats/longest-streaks`
Returns days with consecutive messaging activity (longest active streak, current streak).

**Response:**
```json
{ "longestStreak": 142, "currentStreak": 7, "streakStartDate": "2026-04-05" }
```

---

### 5.2 Chat Routes — `GET /api/chats`

#### `GET /api/chats`
**Query params:** `limit`, `offset`, `sort` (recent | most_messages | name)

Returns paginated chat list.

#### `GET /api/chats/:jid/messages`
**Query params:** `limit`, `offset`, `after`, `before`, `from_me`, `has_media`

Returns messages for a specific chat (for drill-down).

#### `GET /api/chats/:jid/stats`
Returns per-chat stats: total messages, avg per day, top sender, media count, date range.

---

### 5.3 Search Route

#### `GET /api/search`
**Query params:**
| Param | Type | Description |
|---|---|---|
| `q` | string | Full-text query (uses SQLite FTS5) |
| `type` | message \| chat \| contact \| media \| all | Filter by entity type |
| `chat_jid` | string | Restrict to one chat |
| `sender_jid` | string | Restrict to one sender |
| `after` | date | ISO date lower bound |
| `before` | date | ISO date upper bound |
| `from_me` | boolean | Sent messages only |
| `has_media` | boolean | Media messages only |
| `limit` | number | Default 50 |
| `offset` | number | Pagination |

**Response:**
```json
{
  "results": [
    {
      "type": "message",
      "id": "...",
      "chatName": "Family Group",
      "senderName": "Alice",
      "text": "Did you see the ...release notes...",
      "timestamp": "2026-03-14T09:22:00Z",
      "highlight": "Did you see the <mark>release notes</mark>",
      "hasMedia": false
    }
  ],
  "total": 142,
  "took_ms": 12
}
```

---

### 5.4 Media Routes

#### `GET /api/media`
**Query params:** `media_type`, `chat_jid`, `sender_jid`, `limit`, `offset`, `after`, `before`

Returns media metadata list.

#### `GET /api/media/file`
**Query params:** `path` (absolute local path from `media.file_path`)

Streams the actual media file from disk. Used by `<img>` / `<video>` tags in the UI.

> **Security note:** Validate that the requested path is within WhatsApp's known media directory before serving. Reject any path traversal attempts.

---

## 6. Frontend Pages & Components

### 6.1 Page: Dashboard (`/`)

The main landing page. Contains the global **date range picker** (Day / Week / Month / Year / All Time) that drives all charts.

**Layout:** 2-column grid with a sticky top stats bar.

**Top Stats Bar** (always visible):
- Total Messages | Total Chats | Total Contacts | Total Media Files
- Date range of archive (e.g. "Jan 2018 → May 2026")

**Chart Grid:**

| # | Component | Chart Type | Description |
|---|---|---|---|
| 1 | `MessageVolumeArea` | Area chart | Sent vs. received messages over time |
| 2 | `TopContactsBar` | Horizontal bar | Top 10 contacts by message count in period |
| 3 | `ActivityHeatmap` | Heatmap grid | GitHub-style — message count per calendar day |
| 4 | `HourOfDayBar` | Bar chart | Messages by hour of day (busiest times) |
| 5 | `DayOfWeekBar` | Bar chart | Messages by weekday |
| 6 | `MediaBreakdownPie` | Pie / donut | Photos vs. videos vs. audio vs. docs vs. stickers |
| 7 | `MediaSendersBar` | Horizontal bar | Top 10 contacts sending media (filterable by type) |
| 8 | `SentVsReceived` | Stacked bar | Sent vs. received ratio per month |
| 9 | `ResponseTimesBar` | Bar chart | Avg. response time per top contact |
| 10 | `GroupActivityBar` | Horizontal bar | Most active group chats |
| 11 | `StreakCard` | Stat card | Longest + current messaging streak |
| 12 | `WordCloud` | Word cloud | Most frequent words in messages (client-side computed, exclude stopwords) |

**Date Range Picker:** Segmented control — `Day` | `Week` | `Month` | `Year` | `All`. Changes the `period` query param sent to all `/api/stats` endpoints. Stored in Zustand.

---

### 6.2 Page: People (`/people`)

**Layout:** Left: ranked contact list. Right: per-contact detail panel.

**Contact List:**
- Sorted by message count (default), switchable to media sent, response speed.
- Each row: avatar placeholder (initials), name, message count, last seen.
- Clicking a contact opens the detail panel.

**Contact Detail Panel:**
- Mini stat cards: messages sent to them, received from them, avg response time.
- Area chart: message volume with this contact over time.
- Media grid: thumbnails of media sent/received with this contact.
- "View Chat" button → navigates to Chats page filtered to this contact.

---

### 6.3 Page: Chats (`/chats`)

**Layout:** Left: scrollable chat list. Right: message thread view.

**Chat List:**
- Sorted by most recent message.
- Filter: All | Groups | Direct.
- Each row: name, last message preview, timestamp, message count badge.

**Message Thread View:**
- Paginated (infinite scroll upward, 50 messages per load).
- Chat bubbles: sent (right, green-ish) / received (left, neutral).
- Media messages show inline thumbnail with a lightbox on click.
- Timestamp + sender name for group chats.
- Per-chat stats sidebar toggle: message count, media count, top sender.

---

### 6.4 Page: Media (`/media`)

**Layout:** Filter bar on top, masonry grid below.

**Filters:**
- Type: All | Photos | Videos | Audio | Documents | Stickers
- Chat: dropdown (all chats or specific chat)
- Sender: dropdown
- Date range

**Grid:**
- Photos/videos: thumbnail tiles, click to open lightbox.
- Audio: play button with waveform placeholder.
- Documents: file icon + name + size.
- Infinite scroll with virtual windowing (`react-window`) to handle thousands of items.

**Lightbox:** Full-size image/video, sender name, chat name, timestamp, caption (if any), prev/next navigation.

---

### 6.5 Page: Search (`/search`)

**Layout:** Search bar centered at top, filter panel below, results list.

**Search Bar:**
- Prominent, autofocused on page load.
- Debounced (300ms) — queries `/api/search?q=...` as user types.
- Keyboard shortcut: `Cmd+K` from anywhere in the app opens Search.

**Filter Panel (collapsible):**
- Type: All | Messages | Chats | Contacts | Media
- Date range (after / before)
- Chat selector (dropdown)
- Sender selector (dropdown)
- Toggle: "From me only" | "From others only" | "Has media"

**Results List:**
- Each result shows: entity type badge, chat name, sender name, timestamp, highlighted snippet (for messages), thumbnail (for media).
- Grouped by type (Messages section, Contacts section, etc.) when type = All.
- Pagination: 50 results per page.
- "No results" empty state with suggestions.

---

### 6.6 Layout Components

**Sidebar:**
- Fixed left sidebar, 220px wide.
- Navigation links: Dashboard | People | Chats | Media | Search.
- Bottom: archive status (last sync time, DB size), "Sync Now" button (calls `wacrawl sync` via a `/api/admin/sync` shell-exec endpoint — optional, can be omitted for safety).
- App title: "WaCrawl Dashboard" with WhatsApp-green accent.

**TopBar:**
- Page title.
- Global search input (mini, triggers navigation to `/search?q=...`).
- Date range picker (visible on Dashboard page).
- Dark / light mode toggle.

---

## 7. Global UX Patterns

### Date Range Picker
A persistent Zustand store key `dateRange: 'day' | 'week' | 'month' | 'year' | 'all'` drives all stat API calls. Every chart auto-refetches when the period changes. Custom date range (specific calendar selection) is a stretch goal.

### Loading States
All charts use a skeleton shimmer (`shadcn/ui Skeleton`) while data loads. No spinners.

### Empty States
If no data exists for a period, charts show a friendly empty state illustration with the message "No activity in this period."

### Error States
If the backend is unreachable or the DB file is missing, the app shows a full-page error: "Cannot connect to the WaCrawl API — is the server running?" with a retry button.

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Cmd+K` | Open global search |
| `Cmd+1–5` | Navigate to Dashboard / People / Chats / Media / Search |
| `Esc` | Close lightbox / panels |

---

## 8. Backend Implementation Notes

### `db.ts` — SQLite singleton
```typescript
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const DB_PATH = process.env.WACRAWL_DB ?? path.join(os.homedir(), '.wacrawl', 'wacrawl.db');

let _db: Database.Database | null = null;
export function getDb(): Database.Database {
  if (!_db) _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return _db;
}
```

### Key SQL Patterns

**Top contacts by period:**
```sql
SELECT 
  sender_jid, 
  COUNT(*) AS message_count,
  SUM(CASE WHEN from_me = 0 THEN 1 ELSE 0 END) AS received,
  SUM(CASE WHEN from_me = 1 THEN 1 ELSE 0 END) AS sent
FROM messages
WHERE timestamp >= :since AND from_me = 0
GROUP BY sender_jid
ORDER BY message_count DESC
LIMIT :limit;
```

**Period filter helper** — map `period` param to a Unix timestamp cutoff:
```typescript
function sinceTimestamp(period: string): number {
  const now = Date.now() / 1000;
  const map: Record<string, number> = {
    day:   now - 86400,
    week:  now - 604800,
    month: now - 2592000,
    year:  now - 31536000,
    all:   0,
  };
  return map[period] ?? 0;
}
```

> **Note:** wacrawl stores timestamps as seconds since `2001-01-01T00:00:00Z` (Apple CoreData epoch), not Unix epoch. Offset = `978307200` seconds. Adjust all timestamp comparisons accordingly:
> `unix_ts = wacrawl_ts + 978307200`

**FTS5 search:**
```sql
SELECT m.*, c.name AS chat_name, 
  snippet(messages_fts, 0, '<mark>', '</mark>', '…', 20) AS highlight
FROM messages_fts
JOIN messages m ON m.id = messages_fts.rowid
JOIN chats c ON c.id = m.chat_id
WHERE messages_fts MATCH :query
ORDER BY rank
LIMIT :limit OFFSET :offset;
```

### CORS
Configure Express to allow only `http://localhost:5173` (Vite dev) and `http://localhost:4173` (Vite preview).

### Media file serving
```typescript
app.get('/api/media/file', (req, res) => {
  const filePath = req.query.path as string;
  const ALLOWED_PREFIX = path.join(os.homedir(), 'Library', 'Group Containers');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ALLOWED_PREFIX)) return res.status(403).send('Forbidden');
  res.sendFile(resolved);
});
```

---

## 9. Environment & Configuration

```env
# apps/api/.env
PORT=3001
WACRAWL_DB=~/.wacrawl/wacrawl.db   # override if DB is elsewhere
```

```env
# apps/web/.env
VITE_API_URL=http://localhost:3001
```

---

## 10. Setup & Running

```bash
# Install deps (root monorepo)
npm install

# Run both API + web concurrently (add concurrently to root)
npm run dev
# Equivalent to:
#   apps/api: npx ts-node src/index.ts  (or tsx watch src/index.ts)
#   apps/web: vite

# Production build
npm run build
npm run preview   # serves built frontend
```

---

## 11. Milestones / Build Order

Build in this order — each milestone is independently demo-able:

| # | Milestone | What to build |
|---|---|---|
| M1 | **Backend scaffolding** | Express server, `db.ts`, `/api/stats/overview`, `/api/stats/top-contacts` |
| M2 | **Dashboard shell** | Vite app, Sidebar, TopBar, date range picker, Zustand store, stats bar |
| M3 | **Core charts** | MessageVolumeArea, TopContactsBar, ActivityHeatmap |
| M4 | **Activity charts** | HourOfDayBar, DayOfWeekBar, SentVsReceived |
| M5 | **Media stats** | MediaBreakdownPie, MediaSendersBar, `/api/media`, media grid page |
| M6 | **People page** | Contact list, contact detail panel, per-contact charts |
| M7 | **Chats page** | Chat list, message thread, infinite scroll, lightbox |
| M8 | **Search** | `/api/search`, SearchBar, FilterPanel, SearchResults, Cmd+K |
| M9 | **Polish** | WordCloud, StreakCard, ResponseTimesBar, dark mode, keyboard shortcuts |

---

## 12. Suggested Cursor Prompts (in order)

Use these prompts when starting each milestone in Cursor:

1. _"Scaffold a Node.js + Express + TypeScript API in `apps/api/` that opens `~/.wacrawl/wacrawl.db` read-only with `better-sqlite3` and exposes `GET /api/stats/overview`."_
2. _"Create a React + Vite + TypeScript app in `apps/web/` with Tailwind CSS, shadcn/ui, React Router v6, and a sidebar with links: Dashboard, People, Chats, Media, Search."_
3. _"Add a Zustand store with a `period` key ('day'|'week'|'month'|'year'|'all') and a `DateRangePicker` component that updates it."_
4. _"Implement `GET /api/stats/top-contacts?period=week&limit=10` and render it as a Recharts horizontal bar chart in `TopContactsBar.tsx`."_
5. _"Implement the GitHub-style `ActivityHeatmap` component using Recharts or a custom SVG grid that fetches from `/api/stats/activity-heatmap?year=2026`."_
6. _"Implement `GET /api/search` using SQLite FTS5 and build the Search page with a debounced search bar, filter panel, and highlighted results."_

---

## 13. Privacy & Security Notes

- The API binds to `127.0.0.1` only. Do not expose on `0.0.0.0`.
- Add `--host` flag protection in Express: reject requests whose `Host` header is not `localhost`.
- Validate all file-serving paths against the known WhatsApp media directory.
- Do not log message content to stdout/files.
- `.gitignore` must exclude `*.db`, `*.env`, and any exported data files.

---

## 14. Stretch Goals (post-v1)

- **Export:** Download filtered results as CSV or JSON.
- **Sync button:** Trigger `wacrawl sync` via the UI (shell exec from API).
- **Custom date range:** Calendar picker replacing the period toggle.
- **Chat comparison:** Side-by-side stats for two contacts.
- **Sentiment timeline:** Basic positive/negative word ratio over time.
- **Emoji stats:** Most-used emojis per contact and overall.
- **Link tracker:** Most shared URLs / domains.
- **Reply graph:** Visualize who replies to whom in group chats (D3 force graph).
