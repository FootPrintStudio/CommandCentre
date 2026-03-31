from commandcentre.api import CommandCentreAPI
from commandcentre.db import initialize_database


def test_workspace_crud_cycle():
    initialize_database()
    api = CommandCentreAPI()

    created = api.create_workspace("Test Workspace", "🖿")
    assert "id" in created

    workspaces = api.get_workspaces()
    workspace_ids = {workspace["id"] for workspace in workspaces}
    assert created["id"] in workspace_ids

    api.delete_workspace(created["id"])
    remaining_ids = {workspace["id"] for workspace in api.get_workspaces()}
    assert created["id"] not in remaining_ids


def test_app_crud_supports_icon_fields():
    initialize_database()
    api = CommandCentreAPI()
    workspace_id = api.create_workspace("Icon Test", "🖿")["id"]

    created = api.create_app(workspace_id, "App", "echo hi", "Tools", "unicode", "🗎")
    assert "id" in created

    apps = api.get_apps(workspace_id)
    row = next((a for a in apps if a["id"] == created["id"]), None)
    assert row is not None
    assert row["icon_type"] == "unicode"
    assert row["icon_value"] == "🗎"


def test_kanban_done_column_flag_single_workspace():
    initialize_database()
    api = CommandCentreAPI()
    workspace_id = api.create_workspace("Kanban Done", "🖿")["id"]
    cols = api.get_kanban_columns(workspace_id)
    done_col = next(c for c in cols if c["name"] == "Done")
    todo_col = next(c for c in cols if c["name"] == "To Do")
    assert done_col.get("is_done") == 1
    assert todo_col.get("is_done") == 0
    api.update_column(todo_col["id"], "To Do", todo_col.get("sort_order") or 0, True)
    cols2 = api.get_kanban_columns(workspace_id)
    by_id = {c["id"]: c for c in cols2}
    assert by_id[todo_col["id"]]["is_done"] == 1
    assert by_id[done_col["id"]]["is_done"] == 0

