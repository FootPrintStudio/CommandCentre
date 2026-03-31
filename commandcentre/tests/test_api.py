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

