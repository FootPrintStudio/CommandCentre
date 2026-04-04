import sqlite3
from contextlib import contextmanager

from .config import DATABASE_DIR, DATABASE_PATH


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  command_path TEXT NOT NULL,
  category TEXT DEFAULT 'Uncategorized',
  icon_type TEXT DEFAULT 'unicode',
  icon_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT,
  type TEXT CHECK(type IN ('file', 'web')),
  category TEXT DEFAULT 'Uncategorized',
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kanban_columns (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  column_id INTEGER REFERENCES kanban_columns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description_md TEXT,
  priority TEXT DEFAULT 'medium',
  labels TEXT,
  blocking_task_ids TEXT,
  app_ids TEXT,
  resource_ids TEXT,
  due_date TEXT,
  recurrence TEXT DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_tray_apps (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  command_path TEXT NOT NULL,
  category TEXT DEFAULT 'Uncategorized',
  icon_type TEXT DEFAULT 'unicode',
  icon_value TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  entry_type TEXT NOT NULL DEFAULT 'app'
);
"""


def _dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def _drop_legacy_workspace_safe_prefs(conn: sqlite3.Connection) -> None:
    """Removed Safe / Proton Pass integration (vault prefs + lock PIN setting)."""
    conn.execute("DROP TABLE IF EXISTS workspace_safe_prefs")
    conn.execute("DELETE FROM app_settings WHERE key = ?", ("safe_lock_pin",))


def initialize_database() -> None:
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(SCHEMA_SQL)
        _drop_legacy_workspace_safe_prefs(conn)
        _ensure_apps_icon_columns(conn)
        _ensure_apps_resources_sort_order(conn)
        _ensure_kanban_columns_is_done(conn)
        _ensure_tasks_due_recurrence(conn)
        _ensure_workspaces_sort_order(conn)
        _ensure_global_tray_apps_table(conn)
        _ensure_global_tray_entry_type(conn)
        workspace_count = conn.execute("SELECT COUNT(*) AS count FROM workspaces").fetchone()["count"]
        if workspace_count == 0:
            cursor = conn.execute(
                "INSERT INTO workspaces(name, icon, sort_order) VALUES (?, ?, ?)",
                ("Default", "🖿", 0),
            )
            workspace_id = cursor.lastrowid
            conn.executemany(
                "INSERT INTO kanban_columns(workspace_id, name, sort_order, is_done) VALUES (?, ?, ?, ?)",
                [
                    (workspace_id, "To Do", 0, 0),
                    (workspace_id, "In Progress", 1, 0),
                    (workspace_id, "Done", 2, 1),
                ],
            )
        conn.commit()


def _ensure_apps_icon_columns(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(apps)").fetchall()}
    if "icon_type" not in cols:
        conn.execute("ALTER TABLE apps ADD COLUMN icon_type TEXT DEFAULT 'unicode'")
    if "icon_value" not in cols:
        conn.execute("ALTER TABLE apps ADD COLUMN icon_value TEXT")


def _ensure_apps_resources_sort_order(conn: sqlite3.Connection) -> None:
    apps_cols = {row["name"] for row in conn.execute("PRAGMA table_info(apps)").fetchall()}
    apps_added = False
    if "sort_order" not in apps_cols:
        conn.execute("ALTER TABLE apps ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        apps_added = True
    res_cols = {row["name"] for row in conn.execute("PRAGMA table_info(resources)").fetchall()}
    res_added = False
    if "sort_order" not in res_cols:
        conn.execute("ALTER TABLE resources ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        res_added = True

    if apps_added:
        rows = conn.execute(
            "SELECT id, workspace_id, category FROM apps ORDER BY workspace_id, category COLLATE NOCASE, id"
        ).fetchall()
        current_key = None
        order = 0
        for r in rows:
            key = (r["workspace_id"], r["category"] or "Uncategorized")
            if key != current_key:
                current_key = key
                order = 0
            conn.execute("UPDATE apps SET sort_order = ? WHERE id = ?", (order, r["id"]))
            order += 1

    if res_added:
        rows = conn.execute(
            "SELECT id, workspace_id, category FROM resources ORDER BY workspace_id, category COLLATE NOCASE, id"
        ).fetchall()
        current_key = None
        order = 0
        for r in rows:
            key = (r["workspace_id"], r["category"] or "Uncategorized")
            if key != current_key:
                current_key = key
                order = 0
            conn.execute("UPDATE resources SET sort_order = ? WHERE id = ?", (order, r["id"]))
            order += 1


def _ensure_global_tray_apps_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS global_tray_apps (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          command_path TEXT NOT NULL,
          category TEXT DEFAULT 'Uncategorized',
          icon_type TEXT DEFAULT 'unicode',
          icon_value TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          entry_type TEXT NOT NULL DEFAULT 'app'
        )
        """
    )


def _ensure_global_tray_entry_type(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(global_tray_apps)").fetchall()}
    if "entry_type" not in cols:
        conn.execute(
            "ALTER TABLE global_tray_apps ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'app'",
        )


def _ensure_kanban_columns_is_done(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(kanban_columns)").fetchall()}
    if "is_done" not in cols:
        conn.execute("ALTER TABLE kanban_columns ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0")
        conn.execute(
            "UPDATE kanban_columns SET is_done = 1 WHERE lower(trim(name)) = 'done'",
        )


def _ensure_tasks_due_recurrence(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()}
    if "due_date" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN due_date TEXT")
    if "recurrence" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT 'none'")


def _ensure_workspaces_sort_order(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(workspaces)").fetchall()}
    if "sort_order" not in cols:
        conn.execute("ALTER TABLE workspaces ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
        rows = conn.execute("SELECT id FROM workspaces ORDER BY id").fetchall()
        for i, r in enumerate(rows):
            conn.execute("UPDATE workspaces SET sort_order = ? WHERE id = ?", (i, r["id"]))


@contextmanager
def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = _dict_factory
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()

