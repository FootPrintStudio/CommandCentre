from .db import get_connection
from . import system


class CommandCentreAPI:
    def ping(self):
        return {"ok": True, "message": "pong"}

    def get_workspaces(self):
        with get_connection() as conn:
            return conn.execute("SELECT * FROM workspaces ORDER BY id").fetchall()

    def create_workspace(self, name, icon):
        with get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO workspaces(name, icon) VALUES (?, ?)",
                (name, icon),
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

    def get_apps(self, workspace_id):
        with get_connection() as conn:
            return conn.execute(
                "SELECT * FROM apps WHERE workspace_id = ? ORDER BY id",
                (workspace_id,),
            ).fetchall()

    def create_app(self, workspace_id, name, command_path, category="Uncategorized"):
        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO apps(workspace_id, name, command_path, category)
                VALUES (?, ?, ?, ?)
                """,
                (workspace_id, name, command_path, category),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_app(self, app_id, name, command_path, category="Uncategorized"):
        with get_connection() as conn:
            conn.execute(
                "UPDATE apps SET name = ?, command_path = ?, category = ? WHERE id = ?",
                (name, command_path, category, app_id),
            )
            conn.commit()
        return {"ok": True}

    def delete_app(self, app_id):
        with get_connection() as conn:
            conn.execute("DELETE FROM apps WHERE id = ?", (app_id,))
            conn.commit()
        return {"ok": True}

    def get_resources(self, workspace_id):
        with get_connection() as conn:
            return conn.execute(
                "SELECT * FROM resources WHERE workspace_id = ? ORDER BY id",
                (workspace_id,),
            ).fetchall()

    def create_resource(self, workspace_id, name, path, resource_type, category="Uncategorized", description=""):
        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO resources(workspace_id, name, path, type, category, description)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (workspace_id, name, path, resource_type, category, description),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_resource(self, resource_id, name, path, resource_type, category="Uncategorized", description=""):
        with get_connection() as conn:
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

    def get_kanban_columns(self, workspace_id):
        with get_connection() as conn:
            return conn.execute(
                "SELECT * FROM kanban_columns WHERE workspace_id = ? ORDER BY sort_order, id",
                (workspace_id,),
            ).fetchall()

    def create_column(self, workspace_id, name, sort_order=0):
        with get_connection() as conn:
            cursor = conn.execute(
                "INSERT INTO kanban_columns(workspace_id, name, sort_order) VALUES (?, ?, ?)",
                (workspace_id, name, sort_order),
            )
            conn.commit()
            return {"id": cursor.lastrowid}

    def update_column(self, column_id, name, sort_order=0):
        with get_connection() as conn:
            conn.execute(
                "UPDATE kanban_columns SET name = ?, sort_order = ? WHERE id = ?",
                (name, sort_order, column_id),
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
    ):
        with get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT INTO tasks(
                    workspace_id, column_id, title, description_md, priority,
                    labels, blocking_task_ids, app_ids, resource_ids
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ):
        with get_connection() as conn:
            conn.execute(
                """
                UPDATE tasks
                SET column_id = ?, title = ?, description_md = ?, priority = ?,
                    labels = ?, blocking_task_ids = ?, app_ids = ?, resource_ids = ?
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
        return system.set_hotkey_enabled(normalized, "Super+K")

