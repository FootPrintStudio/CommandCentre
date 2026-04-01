import os
import sys
from pathlib import Path

APP_NAME = "CommandCentre"


def _is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False)) and hasattr(sys, "_MEIPASS")


def _package_root() -> Path:
    """Directory containing `templates/` (read-only bundle when frozen)."""
    if _is_frozen():
        return Path(sys._MEIPASS) / "commandcentre"
    return Path(__file__).resolve().parent


def _default_user_data_dir() -> Path:
    """Writable location for the SQLite DB when running from an AppImage / PyInstaller bundle."""
    xdg = (os.environ.get("XDG_DATA_HOME") or "").strip()
    if xdg:
        return Path(xdg).expanduser() / "CommandCentre"
    return Path.home() / ".local" / "share" / "CommandCentre"


BASE_DIR = _package_root()

# Tests should set COMMANDCENTRE_DATABASE_PATH to a temp file so pytest never
# writes workspaces into the developer's real commandcentre/database/*.db.
_db_override = (os.environ.get("COMMANDCENTRE_DATABASE_PATH") or "").strip()
if _db_override:
    DATABASE_PATH = Path(_db_override).expanduser().resolve()
elif _is_frozen():
    DATABASE_PATH = _default_user_data_dir() / "commandcentre.db"
else:
    DATABASE_PATH = BASE_DIR / "database" / "commandcentre.db"

DATABASE_DIR = DATABASE_PATH.parent
TEMPLATES_DIR = BASE_DIR / "templates"
ASSETS_DIR = BASE_DIR / "assets"

