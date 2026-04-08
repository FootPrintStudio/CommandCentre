import json
import os
import subprocess
import sys
from urllib.parse import urlparse
import base64
import mimetypes
import webbrowser
from threading import Thread

import webview
from .db import get_connection

try:
    import pystray
    from PIL import Image, ImageDraw
except Exception:  # noqa: BLE001
    pystray = None
    Image = None
    ImageDraw = None

if pystray is not None:

    class _DaemonTrayIcon(pystray.Icon):
        """pystray's default ``run_detached`` uses a non-daemon thread; the process will not
        exit on quit until that thread ends. Use a daemon thread so closing the last window
        can shut down cleanly after integrations are stopped."""

        def _run_detached(self) -> None:
            Thread(target=lambda: self.run(), daemon=True).start()

else:
    _DaemonTrayIcon = None  # type: ignore[misc, assignment]

try:
    from pynput import keyboard as pynput_keyboard
except Exception:  # noqa: BLE001
    pynput_keyboard = None


RUNTIME = {
    "main_window": None,
    "tray_icon": None,
    "hotkey_listener": None,
}

MAIN_WINDOW_LAYOUT_KEY = "main_window_layout"


def _validate_main_window_layout(data: dict) -> dict | None:
    try:
        x = int(data["x"])
        y = int(data["y"])
        w = max(400, min(10000, int(data["width"])))
        h = max(300, min(10000, int(data["height"])))
        maximized = bool(data.get("maximized", False))
        return {"x": x, "y": y, "width": w, "height": h, "maximized": maximized}
    except (KeyError, TypeError, ValueError):
        return None


def load_main_window_layout() -> dict | None:
    """Restore previous position, size, and maximized flag from app_settings (if any)."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE key = ?",
            (MAIN_WINDOW_LAYOUT_KEY,),
        ).fetchone()
    if not row:
        return None
    raw = row.get("value")
    if raw is None or str(raw).strip() == "":
        return None
    try:
        data = json.loads(str(raw))
        if not isinstance(data, dict):
            return None
        return _validate_main_window_layout(data)
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


def _snapshot_main_window_layout(window) -> dict | None:
    if window is None:
        return None
    uid = getattr(window, "uid", None)
    if uid and sys.platform.startswith("linux"):
        try:
            from webview.platforms import qt as qt_platform

            browser = qt_platform.BrowserView.instances.get(uid)
            if browser is not None:
                maximized = bool(browser.isMaximized())
                if maximized:
                    ng = browser.normalGeometry()
                    x, y, w, h = ng.x(), ng.y(), ng.width(), ng.height()
                else:
                    geo = browser.geometry()
                    x, y, w, h = geo.x(), geo.y(), geo.width(), geo.height()
                return _validate_main_window_layout(
                    {
                        "x": x,
                        "y": y,
                        "width": w,
                        "height": h,
                        "maximized": maximized,
                    }
                )
        except Exception:  # noqa: BLE001
            pass
    try:
        x, y = window.x, window.y
        w, h = window.width, window.height
        return _validate_main_window_layout(
            {"x": x, "y": y, "width": w, "height": h, "maximized": False}
        )
    except Exception:  # noqa: BLE001
        return None


def persist_main_window_layout() -> None:
    """Write current main window geometry (including maximized + normalGeometry when maximized)."""
    snap = _snapshot_main_window_layout(RUNTIME.get("main_window"))
    if not snap:
        return
    try:
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO app_settings(key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                """,
                (MAIN_WINDOW_LAYOUT_KEY, json.dumps(snap)),
            )
            conn.commit()
    except Exception:  # noqa: BLE001
        pass


def launch_app(command_path: str) -> dict:
    try:
        subprocess.Popen(command_path, shell=True)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def open_resource(path_or_url: str, resource_type: str) -> dict:
    try:
        if resource_type == "web":
            webbrowser.open(path_or_url)
        else:
            subprocess.Popen(["xdg-open", path_or_url])
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


_MARKDOWN_HREF_ALLOWED_SCHEMES = frozenset({"http", "https", "mailto", "file"})


def open_markdown_href(href: str) -> dict:
    """Open a link from trusted Markdown in the system browser or file handler (never in-webview)."""
    if href is None:
        return {"ok": False, "error": "Invalid link"}
    s = str(href).strip()
    if not s:
        return {"ok": False, "error": "Empty link"}
    parsed = urlparse(s)
    scheme = (parsed.scheme or "").lower()
    if scheme in ("javascript", "data", "vbscript"):
        return {"ok": False, "error": "Blocked link type"}
    if scheme not in _MARKDOWN_HREF_ALLOWED_SCHEMES:
        return {"ok": False, "error": "Unsupported or relative link"}
    try:
        if scheme == "file":
            subprocess.Popen(["xdg-open", s])
        else:
            webbrowser.open(s)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def set_autostart(enabled: bool) -> dict:
    autostart_dir = os.path.expanduser("~/.config/autostart")
    desktop_file = os.path.join(autostart_dir, "commandcentre.desktop")
    os.makedirs(autostart_dir, exist_ok=True)

    if enabled:
        content = """[Desktop Entry]
Type=Application
Name=CommandCentre
Exec=python3 -m commandcentre.main
X-GNOME-Autostart-enabled=true
"""
        with open(desktop_file, "w", encoding="utf-8") as file:
            file.write(content)
    elif os.path.exists(desktop_file):
        os.remove(desktop_file)

    return {"ok": True}


def is_autostart_enabled() -> dict:
    desktop_file = os.path.expanduser("~/.config/autostart/commandcentre.desktop")
    return {"enabled": os.path.exists(desktop_file)}


def _on_main_window_closing():
    """If the tray is enabled, hide the window instead of destroying it so it can be restored from the tray."""
    persist_main_window_layout()
    if not _get_setting_bool("tray_enabled", True):
        return True
    win = RUNTIME.get("main_window")
    if win is None:
        return True

    def _hide() -> None:
        try:
            win.hide()
        except Exception:  # noqa: BLE001
            pass

    Thread(target=_hide, daemon=True).start()
    return False


def _on_main_window_closed() -> None:
    """Ensure global hotkey and tray are torn down when the main window is destroyed."""
    stop_integrations()


def configure_runtime(main_window) -> None:
    RUNTIME["main_window"] = main_window
    main_window.events.closing += _on_main_window_closing
    main_window.events.closed += _on_main_window_closed


def _open_search_modal() -> None:
    window = RUNTIME.get("main_window")
    if window is None:
        return
    try:
        window.show()
        # restore() exits maximized state on Qt when the window is not minimized; only restore
        # from minimized so Ctrl+K / global search does not un-maximize a focused window.
        try:
            if window.minimized:
                window.restore()
        except Exception:  # noqa: BLE001
            pass
        window.bring_to_front()
    except Exception:  # noqa: BLE001
        pass
    try:
        window.evaluate_js("window.commandCentreOpenSearch && window.commandCentreOpenSearch();")
    except Exception:  # noqa: BLE001
        pass


def _restore_main_window(icon=None, item=None) -> None:
    del icon, item
    window = RUNTIME.get("main_window")
    if window is None:
        return
    try:
        window.show()
        try:
            if window.minimized:
                window.restore()
        except Exception:  # noqa: BLE001
            pass
        window.bring_to_front()
    except Exception:  # noqa: BLE001
        pass


def _hide_main_window(icon=None, item=None) -> None:
    del icon, item
    window = RUNTIME.get("main_window")
    if window is None:
        return
    try:
        window.minimize()
    except Exception:  # noqa: BLE001
        pass


def _quit_app(icon=None, item=None) -> None:
    del icon, item
    stop_integrations()
    try:
        for window in list(webview.windows):
            try:
                window.destroy()
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        pass


def _build_tray_icon_image():
    if Image is None or ImageDraw is None:
        return None
    img = Image.new("RGBA", (64, 64), (15, 23, 42, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle((8, 8, 56, 56), outline=(56, 189, 248, 255), width=4)
    draw.rectangle((20, 20, 44, 44), fill=(16, 185, 129, 255))
    return img


def pick_icon_file() -> dict:
    window = RUNTIME.get("main_window")
    if window is None:
        return {"ok": False, "error": "Main window is not ready."}
    try:
        selection = window.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("Images (*.png;*.jpg;*.jpeg;*.svg;*.ico;*.webp)", "*.png;*.jpg;*.jpeg;*.svg;*.ico;*.webp"),
        )
        if not selection:
            return {"ok": True, "path": ""}
        return {"ok": True, "path": selection[0]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def read_icon_file(path: str) -> dict:
    p = str(path or "").strip()
    if not p:
        return {"ok": False, "error": "Missing icon path."}
    if not os.path.exists(p):
        return {"ok": False, "error": "Icon file not found."}
    try:
        size = os.path.getsize(p)
        if size > 512 * 1024:
            return {"ok": False, "error": "Icon file too large (max 512KB)."}
        mime, _enc = mimetypes.guess_type(p)
        mime = mime or "application/octet-stream"
        with open(p, "rb") as f:
            data = f.read()
        b64 = base64.b64encode(data).decode("ascii")
        return {"ok": True, "data_url": f"data:{mime};base64,{b64}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


def _start_tray() -> dict:
    if pystray is None or _DaemonTrayIcon is None:
        return {"ok": False, "warning": "pystray/Pillow not installed; tray disabled."}
    if RUNTIME.get("tray_icon") is not None:
        return {"ok": True, "message": "Tray already running."}

    icon_image = _build_tray_icon_image()
    if icon_image is None:
        return {"ok": False, "warning": "Could not build tray icon image."}

    menu = pystray.Menu(
        pystray.MenuItem("Show / Restore window", _restore_main_window, default=True),
        pystray.MenuItem("Hide window", _hide_main_window),
        pystray.MenuItem("Open search", lambda icon, item: _open_search_modal()),
        pystray.MenuItem("Quit CommandCentre", _quit_app),
    )
    tray_icon = _DaemonTrayIcon(
        "commandcentre",
        icon_image,
        # X11 WM_NAME / pystray uses latin-1 for the icon title; keep ASCII only.
        "CommandCentre - right-click for menu (Show, Search, Quit)",
        menu,
    )
    tray_icon.run_detached()
    RUNTIME["tray_icon"] = tray_icon
    return {"ok": True}


def _stop_tray() -> dict:
    tray_icon = RUNTIME.get("tray_icon")
    if tray_icon is None:
        return {"ok": True}
    try:
        tray_icon.stop()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    RUNTIME["tray_icon"] = None
    return {"ok": True}


def _stop_hotkey() -> dict:
    listener = RUNTIME.get("hotkey_listener")
    if listener is None:
        return {"ok": True}
    try:
        listener.stop()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}
    RUNTIME["hotkey_listener"] = None
    return {"ok": True}


def _get_setting_bool(key: str, default: bool) -> bool:
    with get_connection() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return default
    return str(row.get("value", "")).strip().lower() in {"1", "true", "yes", "on"}


def get_integration_settings() -> dict:
    return {
        "tray_enabled": _get_setting_bool("tray_enabled", True),
        "hotkey_enabled": _get_setting_bool("hotkey_enabled", True),
        "hotkey_combo": "Ctrl+K",
    }


def _spellcheck_language_tags() -> list[str]:
    """BCP 47-ish tags for Qt WebEngine spell check (e.g. en-US, de-DE)."""
    import locale
    import re

    candidates: list[str] = []
    for key in ("LC_ALL", "LANG", "LC_MESSAGES"):
        raw = (os.environ.get(key) or "").strip()
        if not raw or raw in ("C", "POSIX"):
            continue
        base = raw.split("@")[0].split(".")[0]
        if base and base not in ("C", "POSIX"):
            candidates.append(base)
    try:
        loc = locale.getdefaultlocale()[0]
        if loc:
            candidates.append(loc)
    except Exception:  # noqa: BLE001
        pass
    seen: set[str] = set()
    out: list[str] = []
    for c in candidates:
        if not c:
            continue
        tag = c.replace("_", "-")
        if not re.match(r"^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$", tag):
            continue
        if tag not in seen:
            seen.add(tag)
            out.append(tag)
    return out if out else ["en-US"]


def _apply_webengine_spellcheck_settings() -> None:
    """Enable Qt WebEngine spell checking when using the pywebview Qt backend (e.g. Linux)."""
    win = RUNTIME.get("main_window")
    if win is None:
        return
    uid = getattr(win, "uid", None)
    if not uid:
        return
    try:
        from webview.platforms import qt as qt_platform
    except Exception:  # noqa: BLE001
        return
    if not getattr(qt_platform, "is_webengine", False):
        return
    browser = qt_platform.BrowserView.instances.get(uid)
    if browser is None:
        return
    profile = getattr(browser, "profile", None)
    if profile is None:
        return
    try:
        if hasattr(profile, "setSpellCheckEnabled"):
            profile.setSpellCheckEnabled(True)
        if hasattr(profile, "setSpellCheckLanguages"):
            profile.setSpellCheckLanguages(_spellcheck_language_tags())
    except Exception:  # noqa: BLE001
        pass


def _schedule_webengine_spellcheck() -> None:
    """Defer until the Qt event loop has created the BrowserView."""
    try:
        from qtpy.QtCore import QTimer
        from qtpy.QtWidgets import QApplication

        if QApplication.instance() is not None:
            QTimer.singleShot(0, _apply_webengine_spellcheck_settings)
            return
    except Exception:  # noqa: BLE001
        pass
    _apply_webengine_spellcheck_settings()


def start_integrations() -> dict:
    settings = get_integration_settings()
    tray = _start_tray() if settings["tray_enabled"] else {"ok": True, "message": "Tray disabled by settings."}
    hotkey = (
        register_hotkey(settings["hotkey_combo"], "open_search")
        if settings["hotkey_enabled"]
        else {"ok": True, "message": "Hotkey disabled by settings."}
    )
    _schedule_webengine_spellcheck()
    return {"ok": True, "tray": tray, "hotkey": hotkey, "settings": settings}


def stop_integrations() -> dict:
    _stop_hotkey()
    _stop_tray()
    return {"ok": True}


def set_tray_enabled(enabled: bool) -> dict:
    if enabled:
        return _start_tray()
    return _stop_tray()


def set_hotkey_enabled(enabled: bool, key_combo: str = "Ctrl+K") -> dict:
    if enabled:
        return register_hotkey(key_combo, "open_search")
    return _stop_hotkey()


def register_hotkey(key_combo: str, callback: str) -> dict:
    if pynput_keyboard is None:
        return {"ok": False, "error": "pynput is not installed; global hotkey unavailable."}

    hotkey = key_combo.strip().lower()
    if hotkey in {"super+k", "win+k", "meta+k"}:
        sequence = "<cmd>+k"
    elif hotkey in {"ctrl+k", "control+k"}:
        sequence = "<ctrl>+k"
    else:
        return {"ok": False, "error": f"Unsupported hotkey combo: {key_combo}"}

    if callback == "open_search":
        callback_fn = _open_search_modal
    else:
        return {"ok": False, "error": f"Unsupported callback: {callback}"}

    existing = RUNTIME.get("hotkey_listener")
    if existing is not None:
        try:
            existing.stop()
        except Exception:  # noqa: BLE001
            pass
        RUNTIME["hotkey_listener"] = None

    listener = pynput_keyboard.GlobalHotKeys({sequence: callback_fn})
    listener.daemon = True
    listener.start()
    RUNTIME["hotkey_listener"] = listener
    return {"ok": True, "combo": key_combo, "callback": callback}

