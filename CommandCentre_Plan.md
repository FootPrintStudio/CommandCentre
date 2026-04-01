# CommandCentre

**App Name:** CommandCentre
**Platform:** Desktop, Linux (Linux Mint)
**Description:** A command centre to launch projects, hobbies, and workflows. Focused on organizing apps and resources with light productivity tools.

---

## Tech Stack

- **Backend:** Python 3.10+
- **GUI Framework:** PyWebview (windowed webview)
- **Frontend:** HTML/CSS/JavaScript (vanilla or lightweight framework like Alpine.js)
- **Styling:** Tailwind CSS (via CDN or build step)
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
- **Safe:** GUI for Proton Pass CLi. Default vault set per workspace. Documentation: https://protonpass.github.io/pass-cli/
- **Kanban Board:** Per-workspace task board with custom columns and drag-and-drop.

### Kanban Tasks

- **Title:** Required. Quick identifier.
- **Status:** Derived from column placement.
- **Priority:** Low / Medium / High / Critical.
- **Labels:** Optional tags for categorization.
- **Description:** Optional markdown. Toggle between edit (textarea) and preview (rendered).
- **Apps:** Optional linked apps from launcher.
- **Resources:** Optional linked resources from library.
- **Blocking Tasks:** Optional task dependencies. Blocked tasks are dimmed and cannot move to "Done" until unblocked.

### System Integration

- **Autostart:** `.desktop` file in `~/.config/autostart/`
- **Global Hotkey:** `ctrl+K` opens fuzzy search modal (workspaces, tasks, apps).
- **System Tray:** Minimize to tray, quick restore.

---

## Data Schema

### Tables

```sql
workspaces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

apps (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id),
  name TEXT NOT NULL,
  command_path TEXT NOT NULL,
  category TEXT DEFAULT 'Uncategorized'
)

resources (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id),
  name TEXT NOT NULL,
  path TEXT,
  type TEXT CHECK(type IN ('file', 'web')),
  category TEXT DEFAULT 'Uncategorized',
  description TEXT
)

kanban_columns (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
)

tasks (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id),
  column_id INTEGER REFERENCES kanban_columns(id),
  title TEXT NOT NULL,
  description_md TEXT,
  priority TEXT DEFAULT 'medium',
  labels TEXT,           -- JSON array of strings
  blocking_task_ids TEXT, -- JSON array of integers
  app_ids TEXT,          -- JSON array of integers
  resource_ids TEXT      -- JSON array of integers
)
```

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

#### Safe Section

- GUI for using Proton Pass CLI

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
| DashboardView |	Container for Launcher, Library, Safe sections. |
| LauncherGrid |	3-column app grid, grouped by category. |
| ResourceList |	Accordion list of files/links. |
| SafePanel |	GUI for Proton Pass CLI. |
| KanbanView |	Multi-column board with drag-and-drop. |
| TaskCard |	Compact card with hover actions. |
| TaskModal |	Full-screen editor for task details. |
| GlobalSearch |	Modal with fuzzy search across all data. |

---

## Python API Endpoints

| Function |	Purpose |
|---|---|
| get_workspaces() |	Fetch all workspaces. |
| create_workspace(name, icon) |	Insert new workspace. |
| update_workspace(id, name, icon) |	Modify workspace name/icon. |
| delete_workspace(id) |	Remove workspace and cascade delete related data. |
| get_apps(workspace_id) |	Fetch apps for workspace. |
| create_app(workspace_id, name, command_path, category) |	Add new app. |
| update_app(id, name, command_path, category) |	Modify app. |
| delete_app(id) |	Remove app. |
| get_resources(workspace_id) |	Fetch resources for workspace. |
| create_resource(workspace_id, name, path, type, category, description) |	Add new resource. |
| update_resource(id, name, path, type, category, description) |	Modify resource. |
| delete_resource(id) |	Remove resource. |
| get_kanban_columns(workspace_id) |	Fetch columns for workspace. |
| create_column(workspace_id, name, sort_order) |	Add new column. |
| update_column(id, name, sort_order) |	Modify column name/order. |
| delete_column(id) |	Remove column. |
| get_tasks(workspace_id) |	Fetch tasks for workspace. |
| create_task(workspace_id, column_id, title, description_md, priority, labels, blocking_task_ids, app_ids, resource_ids) |	Add new task. |
| update_task(id, column_id, title, description_md, priority, labels, blocking_task_ids, app_ids, resource_ids) |	Modify task (including column_id on drag). |
| delete_task(id) |	Remove task. |
| launch_app(command_path) |	Execute shell command. |
| open_resource(path_or_url, type) |	Open file via xdg-open or URL in browser. |
| set_autostart(enabled) |	Enable/disable autostart. |
| register_hotkey(key_combo, callback) |	Register global hotkey. |