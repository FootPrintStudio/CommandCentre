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


def test_reorder_workspaces():
    initialize_database()
    api = CommandCentreAPI()
    api.create_workspace("A", "🖿")
    api.create_workspace("B", "🖿")
    ids = [w["id"] for w in api.get_workspaces()]
    reordered = list(reversed(ids))
    assert api.reorder_workspaces(reordered) == {"ok": True}
    assert [w["id"] for w in api.get_workspaces()] == reordered
    bad = api.reorder_workspaces(ids[:1])
    assert bad.get("ok") is False


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
    assert rows[0].get("entry_type") == "app"

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


def test_global_tray_divider_create_and_reorder():
    initialize_database()
    api = CommandCentreAPI()
    a = api.create_global_tray_app("A", "a", "U", "unicode", "a")["id"]
    d = api.create_global_tray_divider("Sep")["id"]
    b = api.create_global_tray_app("B", "b", "U", "unicode", "b")["id"]
    rows = api.get_global_tray_apps()
    ids_all = [r["id"] for r in rows]
    assert ids_all.index(a) < ids_all.index(d) < ids_all.index(b)
    by_id = {r["id"]: r for r in rows}
    assert by_id[d]["entry_type"] == "divider"
    rest = [i for i in ids_all if i not in (a, d, b)]
    new_order = rest + [b, d, a]
    assert api.reorder_global_tray_apps(new_order) == {"ok": True}
    assert [r["id"] for r in api.get_global_tray_apps()] == new_order


def test_export_import_json_roundtrip():
    initialize_database()
    api = CommandCentreAPI()
    ws = api.create_workspace("ExportMe", "🖿")["id"]
    api.create_app(ws, "App1", "true", "Cat", "unicode", "x")
    raw = api.export_data_json()
    data = __import__("json").loads(raw)
    assert data["version"] == 1
    assert any(w["name"] == "ExportMe" for w in data["workspaces"])
    other = CommandCentreAPI()
    assert other.import_data_json(raw, "replace") == {"ok": True}
    w2 = other.get_workspaces()
    assert any(w["name"] == "ExportMe" for w in w2)


def test_ui_custom_css_roundtrip():
    initialize_database()
    api = CommandCentreAPI()
    assert api.get_ui_custom_css() == {"ok": True, "css": ""}
    assert api.set_ui_custom_css("body { margin: 0; }") == {"ok": True}
    assert api.get_ui_custom_css() == {"ok": True, "css": "body { margin: 0; }"}
    assert api.clear_ui_custom_css() == {"ok": True}
    assert api.get_ui_custom_css() == {"ok": True, "css": ""}


def test_get_default_ui_css_reads_bundled_file():
    initialize_database()
    api = CommandCentreAPI()
    res = api.get_default_ui_css()
    assert res.get("ok") is True
    text = res.get("css") or ""
    assert ":root" in text
    assert ".cc-switch" in text or ".cc-modal-panel" in text


def test_set_ui_custom_css_rejects_oversized():
    initialize_database()
    api = CommandCentreAPI()
    huge = "x" * (256 * 1024 + 1)
    out = api.set_ui_custom_css(huge)
    assert out.get("ok") is False
    assert "maximum" in (out.get("error") or "").lower()


def test_get_task_review_queue_excludes_done_and_includes_due_and_critical():
    initialize_database()
    api = CommandCentreAPI()
    ws = api.create_workspace("R", "🖿")["id"]
    cols = api.get_kanban_columns(ws)
    todo = next(c for c in cols if c["name"] == "To Do")
    done = next(c for c in cols if c["name"] == "Done")
    from datetime import date

    today = date.today().isoformat()
    api.create_task(ws, todo["id"], "Due today", "", "medium", "[]", "[]", "[]", "[]", today, "none")
    api.create_task(ws, todo["id"], "Critical open", "", "critical", "[]", "[]", "[]", "[]", "", "none")
    tid_done = api.create_task(ws, done["id"], "Due but done col", "", "medium", "[]", "[]", "[]", "[]", today, "none")[
        "id"
    ]
    q = api.get_task_review_queue()
    assert q["ok"] is True
    titles = {item["title"] for item in q["items"]}
    assert "Due today" in titles
    assert "Critical open" in titles
    assert tid_done not in {item["task_id"] for item in q["items"]}

