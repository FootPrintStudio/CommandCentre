# CommandCentre

**App Name:** CommandCentre
**Platform:** Desktop, Linux (Linux Mint)
**Description:** A command centre to launch projects, hobbies, and workflows. Focused on organizing apps and resources with light productivity tools.

---

## Tech Stack

- **Backend:** Python 3.10+
- **GUI Framework:** PyWebview (windowed webview)
- **Frontend:** HTML/CSS/JavaScript (vanilla or lightweight framework like Alpine.js)
- **Styling:** Tailwind CSS (via CDN) for layout utilities; bundled default theme in `commandcentre/templates/assets/css/commandcentre-default.css` (`:root` tokens and `.cc-*` semantic classes). Optional user overrides in Settings → Appearance / custom CSS, stored in `app_settings` under key `ui_custom_css` (injected as `#cc-user-css` after the default link).
- **Database:** SQLite (`commandcentre.db`) via `sqlite3`
- **Drag & Drop:** Vanilla JS or `interact.js`
- **Icons:** FontAwesome icons
- **System Tray:** `pystray`
- **Global Hotkeys:** `pynput` or `keyboard`
- **Autostart:** `.desktop` file generation via Python

---

## Features

### Workspaces

Core organizational unit. Each workspace represents a distinct project, hobby, or workflow.

- **Quick Switch:** Fast workspace switching via tabs or global hotkey.
- **App Launcher:** Grid of apps and web app bookmarks, grouped by category.
- **Resource Library:** Files and website bookmarks, grouped by category.
- **Kanban Board:** Per-workspace task board with custom columns and drag-and-drop.

### Kanban Tasks

- **Title:** Required. Quick identifier.
- **Status:** Derived from column placement.
- **Priority:** Low / Medium / High / Critical.
- **Labels:** Optional tags for categorization.
- **Description:** Optional markdown. Toggle between edit (textarea) and preview (rendered).
- **Due date & recurrence:** Optional `YYYY-MM-DD` due date; recurrence `none | daily | weekly | monthly | annually` (anchor semantics in UI copy).
- **Apps:** Optional linked apps from launcher.
- **Resources:** Optional linked resources from library.
- **Blocking Tasks:** Optional task dependencies. Blocked tasks are dimmed and cannot move to the done column until unblocked.
- **Client filters:** Text and priority filters on the board; due-today pulse and overdue left border use the **local** calendar date.
- **Markdown trust:** Descriptions are **trusted local notes**: HTML embedded in Markdown is not sanitized. Do not paste untrusted documents into task descriptions.
- **Links in descriptions:** Only `http`, `https`, `mailto`, and `file` URLs are opened (via the system browser or default handler). The embedded webview does not navigate to these links. **Relative** links and other schemes are unsupported (no in-app navigation). In-document fragment links (`#…`) only prevent navigation.

### Universal tray

- **Global launcher row:** Apps and optional **dividers** (`entry_type`: `app` | `divider`); dividers are visual only (no launch). Reorder via drag-and-drop.

### Global search & review

- **Search:** Fuzzy match across workspaces, tasks, apps, resources, tray entries; **scope** all vs current workspace; synthetic **actions** (Dashboard, Kanban, Settings, Task review); keyboard ↑/↓ and Enter while the search field is focused.
- **Task review:** Cross-workspace queue: due today plus critical priority, excluding tasks in the workspace **done** column (`is_done`).

### Data backup

- **JSON export/import:** Versioned snapshot (`export_data_json` / `import_data_json` with **replace** mode). Import is destructive; user confirms by typing `REPLACE`.

### System Integration

- **Autostart:** `.desktop` file in `~/.config/autostart/`
- **Global Hotkey:** `ctrl+K` / `⌘+K` opens fuzzy search modal (workspaces, tasks, apps, resources, tray, actions).
- **System Tray:** Minimize to tray, quick restore.

---

## Data Schema

Tables match `commandcentre/db.py` (`SCHEMA_SQL` plus `_ensure_*` migrations). On init, legacy **Safe / Proton** integration is removed: `workspace_safe_prefs` dropped and `app_settings` key `safe_lock_pin` deleted.

### Tables (logical)

```sql
workspaces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sort_order INTEGER NOT NULL DEFAULT 0
)

apps (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  command_path TEXT NOT NULL,
  category TEXT DEFAULT 'Uncategorized',
  icon_type TEXT DEFAULT 'unicode',
  icon_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
)

resources (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT,
  type TEXT CHECK(type IN ('file', 'web')),
  category TEXT DEFAULT 'Uncategorized',
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
)

kanban_columns (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_done INTEGER NOT NULL DEFAULT 0   -- at most one “done” column per workspace
)

tasks (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  column_id INTEGER REFERENCES kanban_columns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description_md TEXT,
  priority TEXT DEFAULT 'medium',
  labels TEXT,            -- JSON array of strings
  blocking_task_ids TEXT, -- JSON array of integers
  app_ids TEXT,           -- JSON array of integers
  resource_ids TEXT,      -- JSON array of integers
  due_date TEXT,          -- YYYY-MM-DD or NULL
  recurrence TEXT DEFAULT 'none'
)

app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

global_tray_apps (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  command_path TEXT NOT NULL,
  category TEXT DEFAULT 'Uncategorized',
  icon_type TEXT DEFAULT 'unicode',
  icon_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  entry_type TEXT NOT NULL DEFAULT 'app'   -- 'app' | 'divider'
)
```

`app_settings` keys include e.g. `tray_enabled`, `hotkey_enabled`, window geometry, and optional `ui_custom_css` (user stylesheet text).

### Persistence
Auto-save on all changes. No manual save actions.

---

## Architecture

### Python Backend
- Main Entry Point: main.py - Initializes PyWebview window and starts event loop.
- API Layer: Exposes functions to frontend via pywebview.api.
- Database Layer: db.py - SQLite connection and CRUD operations.
- System Integration: system.py - Tray, hotkeys, autostart.
### Frontend
- Single Page Application: All views rendered in one window.
- Communication: JavaScript calls Python API via window.pywebview.api.
- State Management: Vanilla JS or lightweight store pattern.
- Routing: Hash-based routing for Dashboard/Kanban toggle.

---

## Layout
### Structure

| Header: Workspace Tab Bar + Settings + Global Search |
|---|
|Toggle: [Dashboard] [Kanban] |
|Main Panel (Dashboard OR Kanban) |

### Header
- **Workspace Tabs:** Horizontal scrollable. Active tab highlighted.
- **New Workspace Button:** Opens creation modal.
- **Settings Icon:** Opens preferences.
- **Global Search:** Click or Super+K to open fuzzy search modal.

### Dashboard View
#### Launcher Section

- 3-column grid of app/web buttons.
- Grouped by category. Render as collapsible sections.
- Button: Icon + Title.
- Click: Execute command or open URL.

#### Library Section

- Accordion-style list grouped by category.
- Item: Icon + Title + optional description.
- Click: Open file (xdg-open) or URL.

### Kanban View
#### Toolbar

- Add Column button.
- Column management (rename, delete, reorder).

#### Columns

- Vertical scrollable columns.
- Drag-and-drop tasks between columns.
- Update column_id on drop.

#### Task Card

- Compact display: Status icon + Title + Priority indicator.
- Hover: Reveal Edit/Delete buttons.
- Click: Open detail modal.

#### Task Detail Modal

- Full editing interface.
- Fields: Title, Description (markdown), Priority, Labels, Linked Apps, Linked Resources, Blocking Tasks.
- Actions: Save / Cancel / Delete.

---

## Key Components
| Component |	Description |
|--|--|
| WorkspaceSwitcher |	Horizontal tab bar. Handles workspace CRUD. |
| DashboardView |	Container for Launcher and Library sections. |
| LauncherGrid |	3-column app grid, grouped by category. |
| ResourceList |	Accordion list of files/links. |
| KanbanView |	Multi-column board with drag-and-drop. |
| TaskCard |	Compact card with hover actions. |
| TaskModal |	Full-screen editor for task details. |
| GlobalSearch |	Modal with fuzzy search across all data. |

---

## Python API Endpoints

The frontend calls `CommandCentreAPI` methods exposed as `pywebview.api`. Common patterns: workspace-scoped CRUD, `reorder_*` with full id lists, tray + integration helpers in `system.py`.

| Function | Purpose |
|---|---|
| get_workspaces / create_workspace / update_workspace / delete_workspace / reorder_workspaces | Workspace CRUD and tab order. |
| get_apps / create_app / update_app / delete_app / reorder_apps_in_category | Launcher apps (icons: `icon_type`, `icon_value`; `sort_order` per category). |
| get_resources / create_resource / update_resource / delete_resource / reorder_resources_in_category | Library resources. |
| get_kanban_columns / create_column / update_column (name, sort_order, optional `is_done`) / delete_column | Kanban columns; only one `is_done` column per workspace. |
| get_tasks / create_task / update_task / update_task_column / delete_task | Tasks (`due_date`, `recurrence`, JSON link fields). |
| get_global_tray_apps / create_global_tray_app / create_global_tray_divider / update_global_tray_app / delete_global_tray_app / reorder_global_tray_apps | Universal tray (apps + dividers). |
| export_data_json() → str | Versioned JSON snapshot of all user tables. |
| import_data_json(json_string, mode) | **replace** only: wipe user tables and load snapshot. |
| get_task_review_queue() | `{ ok, items: [{ workspace_id, workspace_name, task_id, title, due_date, priority }] }` for due-today ∪ critical, excluding done column. |
| launch_app / open_resource | Open external app or file/URL. |
| get_integration_settings / set_tray_enabled / set_hotkey_enabled / set_autostart / is_autostart_enabled | Tray, hotkey, autostart. |
| get_default_ui_css / get_ui_custom_css / set_ui_custom_css / clear_ui_custom_css | Bundled default CSS file (template); optional user CSS in `app_settings` (`ui_custom_css`, max 256KB). |
| pick_icon_file / read_icon_file | Launcher icon file picker and inline image data. |