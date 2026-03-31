import sys

import webview

from .api import CommandCentreAPI
from .config import APP_NAME, TEMPLATES_DIR
from .db import initialize_database
from . import system


def main():
    initialize_database()
    api = CommandCentreAPI()
    window = webview.create_window(
        APP_NAME,
        url=str(TEMPLATES_DIR / "index.html"),
        js_api=api,
        width=1280,
        height=860,
        min_size=(1000, 700),
    )
    system.configure_runtime(window)
    # Linux: use Qt (PyQt6 + PyQt6-WebEngine in requirements) so a venv works without system PyGObject/GTK.
    start_kw = dict(func=system.start_integrations, debug=True)
    if sys.platform.startswith("linux"):
        start_kw["gui"] = "qt"
    webview.start(**start_kw)


if __name__ == "__main__":
    main()

