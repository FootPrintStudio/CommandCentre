import os
import sys


def _clear_leaked_appimage_qt_env():
    """AppImage AppRun sets QTWEBENGINEPROCESS_PATH / QT_PLUGIN_PATH. If that leaks into a shell,
    `python -m commandcentre` from a venv still points Qt at /tmp/.mount_*/cc-bundle and crashes
    when the helper is missing or wrong. Frozen PyInstaller builds keep these from AppRun."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return
    qtp = (os.environ.get("QTWEBENGINEPROCESS_PATH") or "").strip()
    if qtp:
        norm = qtp.replace("\\", "/")
        if ".mount_" in norm or "/cc-bundle/" in norm or not os.path.isfile(qtp):
            os.environ.pop("QTWEBENGINEPROCESS_PATH", None)
    qpp = (os.environ.get("QT_PLUGIN_PATH") or "").strip()
    if qpp:
        norm = qpp.replace("\\", "/")
        if ".mount_" in norm or "/cc-bundle/" in norm:
            os.environ.pop("QT_PLUGIN_PATH", None)


_clear_leaked_appimage_qt_env()

import webview

from .api import CommandCentreAPI
from .config import APP_NAME, TEMPLATES_DIR
from .db import initialize_database
from . import system


def main():
    initialize_database()
    api = CommandCentreAPI()
    layout = system.load_main_window_layout()
    win_kwargs: dict = {
        "width": 1280,
        "height": 860,
        "min_size": (1000, 700),
    }
    if layout:
        win_kwargs["x"] = layout["x"]
        win_kwargs["y"] = layout["y"]
        win_kwargs["width"] = layout["width"]
        win_kwargs["height"] = layout["height"]
        win_kwargs["maximized"] = layout.get("maximized", False)
    window = webview.create_window(
        APP_NAME,
        url=str(TEMPLATES_DIR / "index.html"),
        js_api=api,
        **win_kwargs,
    )
    system.configure_runtime(window)
    # Linux: use Qt (PyQt6 + PyQt6-WebEngine in requirements) so a venv works without system PyGObject/GTK.
    # Frozen builds (AppImage): disable webview debug to avoid noisy devtools ports.
    start_kw = dict(
        func=system.start_integrations,
        debug=not getattr(sys, "frozen", False),
    )
    if sys.platform.startswith("linux"):
        start_kw["gui"] = "qt"
    webview.start(**start_kw)


if __name__ == "__main__":
    main()

