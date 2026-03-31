from commandcentre.api import CommandCentreAPI
from commandcentre.db import initialize_database


def test_workspace_crud_cycle():
    initialize_database()
    api = CommandCentreAPI()

    created = api.create_workspace("Test Workspace", "fa-folder")
    assert "id" in created

    workspaces = api.get_workspaces()
    workspace_ids = {workspace["id"] for workspace in workspaces}
    assert created["id"] in workspace_ids

    api.delete_workspace(created["id"])
    remaining_ids = {workspace["id"] for workspace in api.get_workspaces()}
    assert created["id"] not in remaining_ids

