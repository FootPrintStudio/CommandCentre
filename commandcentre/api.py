import re

from .db import get_connection
from . import system


def _next_app_sort_order(conn, workspace_id, category):
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM apps WHERE workspace_id = ? AND category = ?",
        (workspace_id, category),
    ).fetchone()
    return int(row["n"] if row and row["n"] is not None else 0)


def _next_resource_sort_order(conn, workspace_id, category):
    row = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM resources WHERE workspace_id = ? AND category = ?",
        (workspace_id, category),
    ).fetchone()
    return int(row["n"] if row and row["n"] is not None else 0)


_TASK_RECURRENCE = frozenset({"none", "daily", "weekly", "monthly", "annually"})


def _normalize_task_recurrence(value):
    s = (value or "none").strip().lower()
    return s if s in _TASK_RECURRENCE else "none"


def _normalize_due_date(value):
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s) else None


class CommandCentreAPI:
    def ping(self):
        return {"ok": True, "message": "pong"}

    def get_workspaces(self):
        with get_connection() as conn:
            return conn.execute(
                "SELECT * FROM workspaces ORDER BY sort_order, id"
            ).fetchall()

    def create_workspace(self, name, icon):
        with get_connection() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM workspaces"
            ).fetchone()
            sort_order = int(row["n"] if row and row["n"] is not None else 0)
            cursor = conn.execute(
                "INSERT INTO workspaces(name, icon, sort_order) VALUES (?, ?, ?)",
                (name, icon, sort_order),
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
            return {"id": workspace_id}

    def update_workspace(self, workspace_id, name, icon):
        with get_connection() as conn:
            conn.execute(
                "UPDATE workspaces SET name = ?, icon = ? WHERE id = ?",
                (name, icon, workspace_id),
            )
            conn.commit()
        return {"ok": True}

    def delete_workspace(self, workspace_id):
        with get_connection() as conn:
            conn.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
            conn.commit()
        return {"ok": True}

    def reorder_workspaces(self, ordered_ids):
        ids = list(ordered_ids or [])
        with get_connection() as conn:
            existing = {row["id"] for row in conn.execute("SELECT id FROM workspaces").fetchall()}
            if set(ids) != existing or len(ids) != len(existing):
                return {"ok": False, "error": "ordered_ids must list each workspace exactly once"}
            for i, wid in enumerate(ids):
                conn.execute(
                    "UPDATE workspaces SET sort_order = ? WHERE id = ?",
                    (i, wid),
                )
            conn.commit()
        return {"ok": True}

    def get_apps(self, workspace_id):
        with get_connection() as conn:
            return conn.execute(
                """
                SELECT * FROM apps WHERE workspace_id = ?
                ORDER BY category COLLATE NOCASE, sort_order, id
                """,
                (workspace_id,),
            ).fetchall()

    def create_app(
        self,
        workspace_id,
        name,
        command_path,
        category="Uncategorized",
        icon_type="unicode",
        icon_value="",
    ):
        with get_connection() as conn:
            sort_order = _next_app_sort_order(conn, workspace_id, category)
            cursor = conn.execute(
                """
                INSERT INTO apps(
                    workspace_id, name, command_path, category, icon_type, icon_value, sort_order
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (workspace_id, name, command_path, category, icon_type, icon_value, sort_order),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_app(
        self,
        app_id,
        name,
        command_path,
        category="Uncategorized",
        icon_type="unicode",
        icon_value="",
    ):
        with get_connection() as conn:
            cur = conn.execute(
                "SELECT workspace_id, category FROM apps WHERE id = ?",
                (app_id,),
            ).fetchone()
            if not cur:
                return {"ok": False, "error": "App not found"}
            ws = cur["workspace_id"]
            old_cat = cur["category"] or "Uncategorized"
            new_cat = category or "Uncategorized"
            if new_cat != old_cat:
                sort_order = _next_app_sort_order(conn, ws, new_cat)
                conn.execute(
                    """
                    UPDATE apps
                    SET name = ?, command_path = ?, category = ?, icon_type = ?, icon_value = ?,
                        sort_order = ?
                    WHERE id = ?
                    """,
                    (name, command_path, category, icon_type, icon_value, sort_order, app_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE apps
                    SET name = ?, command_path = ?, category = ?, icon_type = ?, icon_value = ?
                    WHERE id = ?
                    """,
                    (name, command_path, category, icon_type, icon_value, app_id),
                )
            conn.commit()
        return {"ok": True}

    def delete_app(self, app_id):
        with get_connection() as conn:
            conn.execute("DELETE FROM apps WHERE id = ?", (app_id,))
            conn.commit()
        return {"ok": True}

    def get_global_tray_apps(self):
        with get_connection() as conn:
            return conn.execute(
                "SELECT * FROM global_tray_apps ORDER BY sort_order, id"
            ).fetchall()

    def create_global_tray_app(
        self,
        name,
        command_path,
        category="Uncategorized",
        icon_type="unicode",
        icon_value="",
    ):
        with get_connection() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM global_tray_apps"
            ).fetchone()
            sort_order = int(row["n"] if row and row["n"] is not None else 0)
            cursor = conn.execute(
                """
                INSERT INTO global_tray_apps(
                    name, command_path, category, icon_type, icon_value, sort_order
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (name, command_path, category, icon_type, icon_value, sort_order),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_global_tray_app(
        self,
        app_id,
        name,
        command_path,
        category="Uncategorized",
        icon_type="unicode",
        icon_value="",
    ):
        with get_connection() as conn:
            conn.execute(
                """
                UPDATE global_tray_apps
                SET name = ?, command_path = ?, category = ?, icon_type = ?, icon_value = ?
                WHERE id = ?
                """,
                (name, command_path, category, icon_type, icon_value, app_id),
            )
            conn.commit()
        return {"ok": True}

    def delete_global_tray_app(self, app_id):
        with get_connection() as conn:
            conn.execute("DELETE FROM global_tray_apps WHERE id = ?", (app_id,))
            conn.commit()
        return {"ok": True}

    def reorder_global_tray_apps(self, ordered_ids):
        ids = list(ordered_ids or [])
        with get_connection() as conn:
            existing = {row["id"] for row in conn.execute("SELECT id FROM global_tray_apps").fetchall()}
            if set(ids) != existing or len(ids) != len(existing):
                return {"ok": False, "error": "ordered_ids must list each universal tray app exactly once"}
            for i, app_id in enumerate(ids):
                conn.execute(
                    "UPDATE global_tray_apps SET sort_order = ? WHERE id = ?",
                    (i, app_id),
                )
            conn.commit()
        return {"ok": True}

    def reorder_apps_in_category(self, workspace_id, category, ordered_ids):
        ids = list(ordered_ids or [])
        with get_connection() as conn:
            rows = conn.execute(
                "SELECT id FROM apps WHERE workspace_id = ? AND category = ? ORDER BY sort_order, id",
                (workspace_id, category),
            ).fetchall()
            existing = [r["id"] for r in rows]
            if sorted(ids) != sorted(existing):
                return {"ok": False, "error": "invalid order for workspace category"}
            for i, app_id in enumerate(ids):
                conn.execute("UPDATE apps SET sort_order = ? WHERE id = ?", (i, app_id))
            conn.commit()
        return {"ok": True}

    def get_resources(self, workspace_id):
        with get_connection() as conn:
            return conn.execute(
                """
                SELECT * FROM resources WHERE workspace_id = ?
                ORDER BY category COLLATE NOCASE, sort_order, id
                """,
                (workspace_id,),
            ).fetchall()

    def create_resource(self, workspace_id, name, path, resource_type, category="Uncategorized", description=""):
        with get_connection() as conn:
            sort_order = _next_resource_sort_order(conn, workspace_id, category)
            cursor = conn.execute(
                """
                INSERT INTO resources(
                    workspace_id, name, path, type, category, description, sort_order
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (workspace_id, name, path, resource_type, category, description, sort_order),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_resource(self, resource_id, name, path, resource_type, category="Uncategorized", description=""):
        with get_connection() as conn:
            cur = conn.execute(
                "SELECT workspace_id, category FROM resources WHERE id = ?",
                (resource_id,),
            ).fetchone()
            if not cur:
                return {"ok": False, "error": "Resource not found"}
            ws = cur["workspace_id"]
            old_cat = cur["category"] or "Uncategorized"
            new_cat = category or "Uncategorized"
            if new_cat != old_cat:
                sort_order = _next_resource_sort_order(conn, ws, new_cat)
                conn.execute(
                    """
                    UPDATE resources
                    SET name = ?, path = ?, type = ?, category = ?, description = ?, sort_order = ?
                    WHERE id = ?
                    """,
                    (name, path, resource_type, category, description, sort_order, resource_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE resources
                    SET name = ?, path = ?, type = ?, category = ?, description = ?
                    WHERE id = ?
                    """,
                    (name, path, resource_type, category, description, resource_id),
                )
            conn.commit()
        return {"ok": True}

    def delete_resource(self, resource_id):
        with get_connection() as conn:
            conn.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
            conn.commit()
        return {"ok": True}

    def reorder_resources_in_category(self, workspace_id, category, ordered_ids):
        ids = list(ordered_ids or [])
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT id FROM resources WHERE workspace_id = ? AND category = ?
                ORDER BY sort_order, id
                """,
                (workspace_id, category),
            ).fetchall()
            existing = [r["id"] for r in rows]
            if sorted(ids) != sorted(existing):
                return {"ok": False, "error": "invalid order for workspace category"}
            for i, resource_id in enumerate(ids):
                conn.execute(
                    "UPDATE resources SET sort_order = ? WHERE id = ?",
                    (i, resource_id),
                )
            conn.commit()
        return {"ok": True}

    def get_kanban_columns(self, workspace_id):
        with get_connection() as conn:
            return conn.execute(
                "SELECT * FROM kanban_columns WHERE workspace_id = ? ORDER BY sort_order, id",
                (workspace_id,),
            ).fetchall()

    def create_column(self, workspace_id, name, sort_order=0, is_done=False):
        normalized_done = bool(is_done)
        with get_connection() as conn:
            if normalized_done:
                conn.execute(
                    "UPDATE kanban_columns SET is_done = 0 WHERE workspace_id = ?",
                    (workspace_id,),
                )
            cursor = conn.execute(
                """
                INSERT INTO kanban_columns(workspace_id, name, sort_order, is_done)
                VALUES (?, ?, ?, ?)
                """,
                (workspace_id, name, sort_order, 1 if normalized_done else 0),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_column(self, column_id, name, sort_order=0, is_done=None):
        """
        is_done: True/False sets the done column (only one per workspace; clears others).
        None = leave is_done unchanged (name/sort_order only).
        """
        with get_connection() as conn:
            row = conn.execute(
                "SELECT workspace_id FROM kanban_columns WHERE id = ?",
                (column_id,),
            ).fetchone()
            if not row:
                return {"ok": False, "error": "Column not found"}
            workspace_id = row["workspace_id"]
            if is_done is None:
                conn.execute(
                    "UPDATE kanban_columns SET name = ?, sort_order = ? WHERE id = ?",
                    (name, sort_order, column_id),
                )
            else:
                normalized = bool(is_done)
                if normalized:
                    conn.execute(
                        "UPDATE kanban_columns SET is_done = 0 WHERE workspace_id = ? AND id != ?",
                        (workspace_id, column_id),
                    )
                conn.execute(
                    """
                    UPDATE kanban_columns
                    SET name = ?, sort_order = ?, is_done = ?
                    WHERE id = ?
                    """,
                    (name, sort_order, 1 if normalized else 0, column_id),
                )
            conn.commit()
        return {"ok": True}

    def delete_column(self, column_id):
        with get_connection() as conn:
            conn.execute("DELETE FROM kanban_columns WHERE id = ?", (column_id,))
            conn.commit()
        return {"ok": True}

    def get_tasks(self, workspace_id):
        with get_connection() as conn:
            return conn.execute(
                "SELECT * FROM tasks WHERE workspace_id = ? ORDER BY id",
                (workspace_id,),
            ).fetchall()

    def create_task(
        self,
        workspace_id,
        column_id,
        title,
        description_md="",
        priority="medium",
        labels="[]",
        blocking_task_ids="[]",
        app_ids="[]",
        resource_ids="[]",
        due_date=None,
        recurrence="none",
    ):
        due = _normalize_due_date(due_date)
        rec = _normalize_task_recurrence(recurrence)
        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO tasks(
                    workspace_id, column_id, title, description_md, priority,
                    labels, blocking_task_ids, app_ids, resource_ids,
                    due_date, recurrence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    workspace_id,
                    column_id,
                    title,
                    description_md,
                    priority,
                    labels,
                    blocking_task_ids,
                    app_ids,
                    resource_ids,
                    due,
                    rec,
                ),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_task(
        self,
        task_id,
        column_id,
        title,
        description_md="",
        priority="medium",
        labels="[]",
        blocking_task_ids="[]",
        app_ids="[]",
        resource_ids="[]",
        due_date=None,
        recurrence="none",
    ):
        due = _normalize_due_date(due_date)
        rec = _normalize_task_recurrence(recurrence)
        with get_connection() as conn:
            conn.execute(
                """
                UPDATE tasks
                SET column_id = ?, title = ?, description_md = ?, priority = ?,
                    labels = ?, blocking_task_ids = ?, app_ids = ?, resource_ids = ?,
                    due_date = ?, recurrence = ?
                WHERE id = ?
                """,
                (
                    column_id,
                    title,
                    description_md,
                    priority,
                    labels,
                    blocking_task_ids,
                    app_ids,
                    resource_ids,
                    due,
                    rec,
                    task_id,
                ),
            )
            conn.commit()
        return {"ok": True}

    def update_task_column(self, task_id, column_id):
        with get_connection() as conn:
            conn.execute(
                "UPDATE tasks SET column_id = ? WHERE id = ?",
                (column_id, task_id),
            )
            conn.commit()
        return {"ok": True}

    def delete_task(self, task_id):
        with get_connection() as conn:
            conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            conn.commit()
        return {"ok": True}

    def launch_app(self, command_path):
        return system.launch_app(command_path)

    def open_resource(self, path_or_url, resource_type):
        return system.open_resource(path_or_url, resource_type)

    def set_autostart(self, enabled):
        return system.set_autostart(enabled)

    def is_autostart_enabled(self):
        return system.is_autostart_enabled()

    def open_safe_panel(self, workspace_id):
        return system.open_safe_panel(workspace_id)

    def safe_cli_status(self):
        return system.safe_cli_status()

    def safe_cli_list_vaults(self):
        return system.safe_cli_list_vaults()

    def safe_cli_list_items(self, vault_id):
        return system.safe_cli_list_items(vault_id)

    def safe_cli_login(self):
        return system.safe_cli_login()

    def safe_cli_logout(self):
        return system.safe_cli_logout()

    def safe_cli_debug(self, vault_id):
        return system.safe_cli_debug(vault_id)

    def safe_cli_get_item(self, vault_id, item_id):
        return system.safe_cli_get_item(vault_id, item_id)

    def safe_cli_get_totp(self, vault_id, item_id):
        return system.safe_cli_get_totp(vault_id, item_id)

    def safe_cli_delete_item(self, vault_id, item_id):
        return system.safe_cli_delete_item(vault_id, item_id)

    def safe_cli_create_note(self, vault_id, title, note):
        return system.safe_cli_create_note(vault_id, title, note)

    def pick_icon_file(self):
        return system.pick_icon_file()

    def read_icon_file(self, path):
        return system.read_icon_file(path)

    def get_workspace_safe_pref(self, workspace_id):
        with get_connection() as conn:
            row = conn.execute(
                "SELECT vault_id FROM workspace_safe_prefs WHERE workspace_id = ?",
                (workspace_id,),
            ).fetchone()
        return {"workspace_id": workspace_id, "vault_id": row["vault_id"] if row else None}

    def set_workspace_safe_pref(self, workspace_id, vault_id):
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO workspace_safe_prefs(workspace_id, vault_id, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(workspace_id)
                DO UPDATE SET vault_id = excluded.vault_id, updated_at = CURRENT_TIMESTAMP
                """,
                (workspace_id, vault_id),
            )
            conn.commit()
        return {"ok": True}

    def register_hotkey(self, key_combo, callback):
        return system.register_hotkey(key_combo, callback)

    def get_integration_settings(self):
        return system.get_integration_settings()

    def verify_safe_lock_pin(self, pin):
        return system.verify_safe_lock_pin(pin)

    def set_safe_lock_pin(self, pin):
        return system.set_safe_lock_pin(pin)

    def set_tray_enabled(self, enabled):
        normalized = bool(enabled)
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO app_settings(key, value, updated_at)
                VALUES ('tray_enabled', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                """,
                ("1" if normalized else "0",),
            )
            conn.commit()
        return system.set_tray_enabled(normalized)

    def set_hotkey_enabled(self, enabled):
        normalized = bool(enabled)
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO app_settings(key, value, updated_at)
                VALUES ('hotkey_enabled', ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                """,
                ("1" if normalized else "0",),
            )
            conn.commit()
        return system.set_hotkey_enabled(normalized, "Ctrl+K")

