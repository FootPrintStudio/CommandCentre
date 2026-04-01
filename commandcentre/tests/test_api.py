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


def test_global_tray_apps_not_scoped_to_workspace():
    initialize_database()
    api = CommandCentreAPI()

    assert api.get_global_tray_apps() == []

    created = api.create_global_tray_app("Notes", "gedit", "Tools", "unicode", "📝")
    assert "id" in created

    rows = api.get_global_tray_apps()
    assert len(rows) == 1
    assert rows[0]["name"] == "Notes"
    assert rows[0]["command_path"] == "gedit"
    assert rows[0]["sort_order"] == 0

    api.update_global_tray_app(created["id"], "Notes2", "gedit", "Tools", "unicode", "📓")
    rows2 = api.get_global_tray_apps()
    assert rows2[0]["name"] == "Notes2"
    assert rows2[0]["icon_value"] == "📓"

    api.delete_global_tray_app(created["id"])
    assert api.get_global_tray_apps() == []


def test_reorder_global_tray_apps():
    initialize_database()
    api = CommandCentreAPI()
    id_a = api.create_global_tray_app("A", "a", "U", "unicode", "a")["id"]
    id_b = api.create_global_tray_app("B", "b", "U", "unicode", "b")["id"]
    assert api.reorder_global_tray_apps([id_b, id_a]) == {"ok": True}
    rows = api.get_global_tray_apps()
    assert [r["id"] for r in rows] == [id_b, id_a]
    bad = api.reorder_global_tray_apps([id_a])
    assert bad.get("ok") is False


def test_reorder_apps_and_resources_in_category():
    initialize_database()
    api = CommandCentreAPI()
    ws = api.create_workspace("R", "🖿")["id"]
    id_a = api.create_app(ws, "A", "a", "Cat", "unicode", "a")["id"]
    id_b = api.create_app(ws, "B", "b", "Cat", "unicode", "b")["id"]
    assert api.reorder_apps_in_category(ws, "Cat", [id_b, id_a]) == {"ok": True}
    apps = api.get_apps(ws)
    cat_apps = [a for a in apps if (a.get("category") or "Uncategorized") == "Cat"]
    assert [a["id"] for a in cat_apps] == [id_b, id_a]

    ra = api.create_resource(ws, "R1", "/", "web", "Lib", "")["id"]
    rb = api.create_resource(ws, "R2", "/", "web", "Lib", "")["id"]
    assert api.reorder_resources_in_category(ws, "Lib", [rb, ra]) == {"ok": True}
    res = api.get_resources(ws)
    lib = [r for r in res if (r.get("category") or "Uncategorized") == "Lib"]
    assert [r["id"] for r in lib] == [rb, ra]


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

