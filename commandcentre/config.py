import os
from pathlib import Path

APP_NAME = "CommandCentre"
BASE_DIR = Path(__file__).resolve().parent

# Tests should set COMMANDCENTRE_DATABASE_PATH to a temp file so pytest never
# writes workspaces into the developer's real commandcentre/database/*.db.
_db_override = (os.environ.get("COMMANDCENTRE_DATABASE_PATH") or "").strip()
if _db_override:
    DATABASE_PATH = Path(_db_override).expanduser().resolve()
else:
    DATABASE_PATH = BASE_DIR / "database" / "commandcentre.db"

DATABASE_DIR = DATABASE_PATH.parent
TEMPLATES_DIR = BASE_DIR / "templates"
ASSETS_DIR = BASE_DIR / "assets"

