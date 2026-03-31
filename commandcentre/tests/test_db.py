from commandcentre.db import initialize_database, get_connection


def test_initialize_database_creates_default_workspace():
    initialize_database()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT name FROM workspaces ORDER BY id LIMIT 1"
        ).fetchone()
    assert row is not None
    assert row["name"] == "Default"

