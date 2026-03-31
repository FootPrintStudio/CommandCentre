import sqlite3
from contextlib import contextmanager

from .config import DATABASE_DIR, DATABASE_PATH


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  command_path TEXT NOT NULL,
  category TEXT DEFAULT 'Uncategorized'
);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT,
  type TEXT CHECK(type IN ('file', 'web')),
  category TEXT DEFAULT 'Uncategorized',
  description TEXT
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
  resource_ids TEXT
);

CREATE TABLE IF NOT EXISTS workspace_safe_prefs (
  workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  vault_id TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


def _dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def initialize_database() -> None:
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    with get_connection() as conn:
        conn.executescript(SCHEMA_SQL)
        workspace_count = conn.execute("SELECT COUNT(*) AS count FROM workspaces").fetchone()["count"]
        if workspace_count == 0:
            cursor = conn.execute(
                "INSERT INTO workspaces(name, icon) VALUES (?, ?)",
                ("Default", "fa-folder"),
            )
            workspace_id = cursor.lastrowid
            conn.executemany(
                "INSERT INTO kanban_columns(workspace_id, name, sort_order) VALUES (?, ?, ?)",
                [
                    (workspace_id, "To Do", 0),
                    (workspace_id, "In Progress", 1),
                    (workspace_id, "Done", 2),
                ],
            )
        conn.commit()


@contextmanager
def get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = _dict_factory
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()

