import json
import os
import re
import shutil
import subprocess
import sys
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


SAFE_WINDOWS = {}
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


def _run_pass_cli(args: list[str]) -> tuple[bool, str, str]:
    command = ["pass-cli", *args]
    proc = subprocess.run(command, capture_output=True, text=True)
    ok = proc.returncode == 0
    return ok, proc.stdout.strip(), proc.stderr.strip()


def _normalize_json_list(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("items", "vaults", "data", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def _extract_label(item: dict, fallback: str = "Unnamed") -> str:
    for key in ("name", "title", "label"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return fallback


def _sanitize_cli_lines(lines: list[str], excluded_lower: set[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith("usage:") or "for more information" in lower:
            continue
        if lower in excluded_lower:
            continue
        # Ignore separators / bullets-only / table borders.
        if all(ch in "-_=|+" for ch in line):
            continue
        if line.startswith("- "):
            line = line[2:].strip()
        if line.startswith("* "):
            line = line[2:].strip()
        # Ignore numbered list prefixes like "1) Foo" / "1. Foo".
        if len(line) > 3 and line[0].isdigit() and line[1] in {".", ")"} and line[2] == " ":
            line = line[3:].strip()
        if not line or line == "-":
            continue
        # Keep only lines that look like real names (avoid separators/garbage rows).
        if re.search(r"[A-Za-z0-9]", line) is None:
            continue
        cleaned.append(line)
    return cleaned


# Proton Pass `item view --output json`: `content.content` holds type-specific blobs.
_PASS_ITEM_TYPE_KEYS = (
    "Login",
    "Alias",
    "Note",
    "Card",
    "CreditCard",
    "PaymentCard",
    "Identity",
    "Wifi",
    "WifiCredentials",
    "SSHKey",
    "CryptoWallet",
)


def _merge_pass_item_type_buckets(nested_content: dict) -> dict:
    """Merge Login + Card + … into one dict. Items often include both a sparse Login and Card data."""
    merged: dict = {}
    if not isinstance(nested_content, dict):
        return merged
    for name in _PASS_ITEM_TYPE_KEYS:
        node = nested_content.get(name)
        if isinstance(node, dict) and node:
            merged.update(node)
    for key, node in nested_content.items():
        if key in _PASS_ITEM_TYPE_KEYS:
            continue
        if isinstance(node, dict) and node:
            merged.update(node)
    return merged


def _pretty_pass_field_key(key: str) -> str:
    """API keys like cardholderName -> display label Cardholder Name."""
    if not key:
        return key
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", key)
    spaced = spaced.replace("_", " ").strip()
    return spaced.title()


def _parse_bracket_id_line(entry: str) -> tuple[str, str, str] | None:
    # Common pass-cli list format: [<id>]: <name> (state=Active)
    match = re.match(r"^\[([^\]]+)\]:\s*(.+)$", entry)
    if not match:
        return None
    item_id = match.group(1).strip()
    rest = match.group(2).strip()
    state = ""
    state_match = re.search(r"\(state=([^)]+)\)\s*$", rest)
    if state_match:
        state = state_match.group(1).strip()
        rest = re.sub(r"\(state=[^)]+\)\s*$", "", rest).strip()
    label = rest or item_id
    return item_id, label, state


def _launch_in_terminal(command: str) -> bool:
    terminal_commands = [
        ["x-terminal-emulator", "-e", command],
        ["gnome-terminal", "--", "bash", "-lc", command],
        ["konsole", "-e", "bash", "-lc", command],
        ["xfce4-terminal", "-e", command],
        ["xterm", "-e", command],
    ]
    for candidate in terminal_commands:
        executable = candidate[0]
        if shutil.which(executable) is None:
            continue
        try:
            subprocess.Popen(candidate)
            return True
        except Exception:  # noqa: BLE001
            continue
    return False


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


def safe_cli_status() -> dict:
    if shutil.which("pass-cli") is None:
        return {
            "installed": False,
            "logged_in": False,
            "message": "pass-cli not found. Install Proton Pass CLI first.",
        }

    ok, stdout, stderr = _run_pass_cli(["vault", "list"])
    if ok:
        return {"installed": True, "logged_in": True, "message": "Connected"}
    msg = stderr or stdout or "Unable to query pass-cli status."
    lowered = msg.lower()
    if "login" in lowered or "authenticate" in lowered or "not logged" in lowered:
        return {"installed": True, "logged_in": False, "message": msg}
    return {"installed": True, "logged_in": False, "message": msg}


def safe_cli_list_vaults() -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}

    ok, stdout, stderr = _run_pass_cli(["vault", "list"])
    if not ok:
        return {"ok": False, "error": stderr or stdout or "Failed to list vaults."}

    # Try JSON first in case newer CLI emits it via config/env.
    try:
        parsed = json.loads(stdout)
        raw_vaults = _normalize_json_list(parsed)
        vaults = []
        for vault in raw_vaults:
            vault_id = vault.get("id") or vault.get("vaultId") or vault.get("vault_id")
            if vault_id is None:
                continue
            vaults.append(
                {
                    "id": str(vault_id),
                    "name": _extract_label(vault, fallback=f"Vault {vault_id}"),
                }
            )
        if vaults:
            return {"ok": True, "vaults": vaults}
    except json.JSONDecodeError:
        pass

    # Plain-text fallback: keep only meaningful lines and normalize bullets.
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    cleaned = _sanitize_cli_lines(lines, {"vault", "vaults"})

    vaults = []
    for entry in cleaned:
        parsed = _parse_bracket_id_line(entry)
        if parsed:
            share_id, name, _state = parsed
            vaults.append({"id": share_id, "name": name, "share_id": share_id, "vault_name": name})
            continue
        # Fallback plain name style
        vaults.append({"id": entry, "name": entry, "share_id": "", "vault_name": entry})
    return {"ok": True, "vaults": vaults}


def safe_cli_list_items(vault_id: str) -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}

    # Per Proton Pass CLI docs, baseline syntax is: pass-cli item list [VAULT_NAME]
    if not str(vault_id).strip() or str(vault_id).strip() == "-":
        return {"ok": False, "error": "Invalid vault selection."}

    candidate_args = [
        ["item", "list", "--share-id", str(vault_id)],
        ["item", "list", "--vault-name", str(vault_id)],
        ["item", "list", "--vault", str(vault_id)],
        ["item", "list", str(vault_id)],
        ["item", "list"],
    ]

    outputs = []
    for args in candidate_args:
        ok, stdout, stderr = _run_pass_cli(args)
        outputs.append((ok, stdout, stderr))
        if not ok:
            continue
        try:
            parsed = json.loads(stdout)
            raw_items = _normalize_json_list(parsed)
            items = []
            for item in raw_items:
                item_id = item.get("id") or item.get("itemId") or item.get("item_id")
                if item_id is None:
                    continue
                items.append(
                    {
                        "id": str(item_id),
                        "name": _extract_label(item, fallback=f"Item {item_id}"),
                        "type": str(item.get("type", "")),
                    }
                )
            return {"ok": True, "items": items}
        except json.JSONDecodeError:
            lines = [line.strip() for line in stdout.splitlines() if line.strip()]
            cleaned = _sanitize_cli_lines(lines, {"items", "item"})
            if cleaned:
                items = []
                for entry in cleaned:
                    parsed = _parse_bracket_id_line(entry)
                    if parsed:
                        item_id, label, state = parsed
                        items.append({"id": item_id, "name": label, "type": "", "state": state})
                    else:
                        items.append({"id": entry, "name": entry, "type": "", "state": ""})
                return {"ok": True, "items": items}

    last = outputs[-1] if outputs else (False, "", "")
    return {"ok": False, "error": last[2] or last[1] or "Failed to list items for vault."}


def safe_cli_get_item(vault_id: str, item_id: str) -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}
    if not str(vault_id).strip() or not str(item_id).strip():
        return {"ok": False, "error": "Invalid vault/item selection."}

    candidate_args = [
        ["item", "view", "--share-id", str(vault_id), "--item-id", str(item_id), "--output", "json"],
        ["item", "view", "--vault-name", str(vault_id), "--item-id", str(item_id), "--output", "json"],
        ["item", "view", f"pass://{vault_id}/{item_id}", "--output", "json"],
        ["item", "view", "--share-id", str(vault_id), "--item-id", str(item_id)],
        ["item", "view", "--vault-name", str(vault_id), "--item-id", str(item_id)],
        ["item", "view", f"pass://{vault_id}/{item_id}"],
    ]

    outputs = []
    for args in candidate_args:
        ok, stdout, stderr = _run_pass_cli(args)
        outputs.append((ok, stdout, stderr, args))
        if not ok:
            continue

        # JSON detail mode if supported
        try:
            parsed = json.loads(stdout)
            if isinstance(parsed, dict):
                # Handle modern output shape: { "item": {...}, "attachments": [...] }
                item_obj = parsed.get("item") if isinstance(parsed.get("item"), dict) else parsed
                content = item_obj.get("content") if isinstance(item_obj.get("content"), dict) else {}
                nested_content = content.get("content")
                merged_type = (
                    _merge_pass_item_type_buckets(nested_content)
                    if isinstance(nested_content, dict)
                    else {}
                )

                title = (
                    content.get("title")
                    if isinstance(content.get("title"), str) and content.get("title").strip()
                    else item_obj.get("name")
                    or item_obj.get("title")
                    or parsed.get("name")
                    or parsed.get("title")
                    or str(item_id)
                )

                fields = {}

                # Flat keys fallback (older variants)
                for key in ("username", "email", "url", "password", "notes", "note", "totp"):
                    value = item_obj.get(key)
                    if isinstance(value, str) and value.strip():
                        fields[key] = value.strip()

                # Proton Pass nested fields (Login, Card, Identity, … merged)
                email_value = merged_type.get("email")
                username_value = merged_type.get("username")
                if isinstance(username_value, str) and username_value.strip():
                    fields["username"] = username_value.strip()
                if isinstance(email_value, str) and email_value.strip():
                    normalized = email_value.strip()
                    # Some entries store username under "email". If it does not
                    # look like an email address, prefer showing it as username.
                    if "@" in normalized:
                        fields["email"] = normalized
                    elif "username" not in fields:
                        fields["username"] = normalized
                    else:
                        fields["email"] = normalized

                for key in ("password", "totp_uri"):
                    value = merged_type.get(key)
                    if isinstance(value, str) and value.strip():
                        fields[key] = value.strip()

                urls = merged_type.get("urls")
                if isinstance(urls, list):
                    normalized_urls = [u.strip() for u in urls if isinstance(u, str) and u.strip()]
                    if normalized_urls:
                        fields["urls"] = ", ".join(normalized_urls)

                _login_handled = {"username", "email", "password", "totp_uri", "urls"}
                for key, value in merged_type.items():
                    if key in _login_handled:
                        continue
                    if isinstance(value, str) and value.strip():
                        label = _pretty_pass_field_key(key)
                        fields[label] = value.strip()
                    elif isinstance(value, list) and value:
                        parts = [
                            str(x).strip()
                            for x in value
                            if isinstance(x, str) and x.strip()
                        ]
                        if parts:
                            fields[_pretty_pass_field_key(key)] = ", ".join(parts)

                note_value = content.get("note")
                if isinstance(note_value, str) and note_value.strip():
                    fields["note"] = note_value.strip()

                state_value = item_obj.get("state")
                if isinstance(state_value, str) and state_value.strip():
                    fields["state"] = state_value.strip()

                # Extra fields array support
                extra_fields = content.get("extra_fields")
                if isinstance(extra_fields, list):
                    for field in extra_fields:
                        if not isinstance(field, dict):
                            continue
                        label = str(field.get("field_name") or field.get("name") or field.get("label") or "").strip()
                        value = field.get("data") or field.get("value")
                        if label and isinstance(value, str) and value.strip():
                            fields[label] = value.strip()

                # Generic nested custom fields fallback
                custom_fields = item_obj.get("fields") or parsed.get("fields")
                if isinstance(custom_fields, list):
                    for field in custom_fields:
                        if not isinstance(field, dict):
                            continue
                        label = str(field.get("name") or field.get("label") or "").strip()
                        value = field.get("value")
                        if label and isinstance(value, str) and value.strip():
                            fields[label] = value.strip()
                return {"ok": True, "item": {"id": str(item_id), "name": str(title), "fields": fields}}
        except json.JSONDecodeError:
            pass

        # Plain-text fallback
        lines = [line.strip() for line in stdout.splitlines() if line.strip()]
        cleaned = _sanitize_cli_lines(lines, {"item", "items"})
        if cleaned:
            fields = {}
            title = str(item_id)
            for idx, line in enumerate(cleaned):
                # key: value pairs
                if ":" in line:
                    key, value = line.split(":", 1)
                    k = key.strip()
                    v = value.strip()
                    if not k or not v:
                        continue
                    if idx == 0 and k.lower() in {"name", "title", "item"}:
                        title = v
                    else:
                        fields[k] = v
                elif idx == 0:
                    title = line
            return {"ok": True, "item": {"id": str(item_id), "name": title, "fields": fields}}

    last = outputs[-1] if outputs else (False, "", "", [])
    return {
        "ok": False,
        "error": last[2] or last[1] or "Failed to fetch item details.",
        "attempted_args": last[3],
    }


def safe_cli_get_totp(vault_id: str, item_id: str) -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}
    if not str(vault_id).strip() or not str(item_id).strip():
        return {"ok": False, "error": "Invalid vault/item selection."}

    candidate_args = [
        ["item", "totp", "--share-id", str(vault_id), "--item-id", str(item_id), "--output", "json"],
        ["item", "totp", "--vault-name", str(vault_id), "--item-id", str(item_id), "--output", "json"],
        ["item", "totp", f"pass://{vault_id}/{item_id}", "--output", "json"],
        ["item", "totp", "--share-id", str(vault_id), "--item-id", str(item_id)],
        ["item", "totp", "--vault-name", str(vault_id), "--item-id", str(item_id)],
        ["item", "totp", f"pass://{vault_id}/{item_id}"],
    ]

    outputs = []
    for args in candidate_args:
        ok, stdout, stderr = _run_pass_cli(args)
        outputs.append((ok, stdout, stderr, args))
        if not ok:
            continue
        try:
            parsed = json.loads(stdout)
            if isinstance(parsed, dict):
                for key in ("totp", "code", "value"):
                    value = parsed.get(key)
                    if isinstance(value, str) and value.strip():
                        return {"ok": True, "totp": value.strip()}
                # fallback: first string value
                for value in parsed.values():
                    if isinstance(value, str) and value.strip():
                        return {"ok": True, "totp": value.strip()}
            if isinstance(parsed, str) and parsed.strip():
                return {"ok": True, "totp": parsed.strip()}
        except json.JSONDecodeError:
            pass

        # Human output fallback: find first 6-10 digit token
        match = re.search(r"\b(\d{6,10})\b", stdout)
        if match:
            return {"ok": True, "totp": match.group(1)}
        if stdout.strip():
            return {"ok": True, "totp": stdout.strip().splitlines()[-1].strip()}

    last = outputs[-1] if outputs else (False, "", "", [])
    return {"ok": False, "error": last[2] or last[1] or "Failed to generate TOTP.", "attempted_args": last[3]}


def safe_cli_delete_item(vault_id: str, item_id: str) -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}
    if not str(vault_id).strip() or not str(item_id).strip():
        return {"ok": False, "error": "Invalid vault/item selection."}

    candidate_args = [
        ["item", "trash", "--share-id", str(vault_id), "--item-id", str(item_id)],
        ["item", "trash", "--vault-name", str(vault_id), "--item-id", str(item_id)],
        ["item", "trash", f"pass://{vault_id}/{item_id}"],
        ["item", "delete", "--share-id", str(vault_id), "--item-id", str(item_id)],
        ["item", "delete", "--vault-name", str(vault_id), "--item-id", str(item_id)],
        ["item", "delete", f"pass://{vault_id}/{item_id}"],
    ]

    outputs = []
    for args in candidate_args:
        ok, stdout, stderr = _run_pass_cli(args)
        outputs.append((ok, stdout, stderr, args))
        if ok:
            return {"ok": True, "message": stdout or "Item removed."}

    last = outputs[-1] if outputs else (False, "", "", [])
    return {"ok": False, "error": last[2] or last[1] or "Failed to delete item.", "attempted_args": last[3]}


def safe_cli_create_note(vault_id: str, title: str, note: str) -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}
    if not str(vault_id).strip():
        return {"ok": False, "error": "Invalid vault selection."}
    if not str(title).strip():
        return {"ok": False, "error": "Note title is required."}
    note_value = str(note or "").strip()

    candidate_args = [
        ["item", "create", "note", "--share-id", str(vault_id), "--title", str(title), "--note", note_value],
        ["item", "create", "note", "--vault-name", str(vault_id), "--title", str(title), "--note", note_value],
        ["item", "create", "note", "--share-id", str(vault_id), "--title", str(title)],
        ["item", "create", "note", "--vault-name", str(vault_id), "--title", str(title)],
        # Legacy/fallback variants for broader pass-cli compatibility.
        ["item", "create", "--share-id", str(vault_id), "--type", "note", "--title", str(title), "--note", note_value],
        ["item", "create", "--vault-name", str(vault_id), "--type", "note", "--title", str(title), "--note", note_value],
    ]

    outputs = []
    for args in candidate_args:
        ok, stdout, stderr = _run_pass_cli(args)
        outputs.append((ok, stdout, stderr, args))
        if ok:
            return {"ok": True, "message": stdout or "Note created."}

    last = outputs[-1] if outputs else (False, "", "", [])
    return {"ok": False, "error": last[2] or last[1] or "Failed to create note.", "attempted_args": last[3]}


def safe_cli_debug(vault_id: str) -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}

    commands = [
        ["vault", "list"],
        ["item", "list", "--vault-name", str(vault_id)],
        ["item", "list", "--vault", str(vault_id)],
        ["item", "list", str(vault_id)],
        ["item", "list"],
    ]
    runs = []
    for args in commands:
        ok, stdout, stderr = _run_pass_cli(args)
        runs.append(
            {
                "args": args,
                "ok": ok,
                "stdout": stdout,
                "stderr": stderr,
            }
        )
    return {"ok": True, "runs": runs}


def safe_cli_login() -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}

    command = "pass-cli login; echo; echo 'Press Enter to close...'; read -r _"
    launched = _launch_in_terminal(command)
    if launched:
        return {"ok": True, "message": "Login terminal opened."}
    return {
        "ok": False,
        "error": "Could not open a terminal for pass-cli login. Run `pass-cli login` manually.",
    }


def safe_cli_logout() -> dict:
    if shutil.which("pass-cli") is None:
        return {"ok": False, "error": "pass-cli is not installed."}
    ok, stdout, stderr = _run_pass_cli(["logout"])
    if not ok:
        return {"ok": False, "error": stderr or stdout or "Failed to logout."}
    return {"ok": True}


def open_safe_panel(workspace_id: int) -> dict:
    workspace_key = int(workspace_id)
    existing = SAFE_WINDOWS.get(workspace_key)

    if existing is not None:
        try:
            existing.show()
            existing.restore()
            existing.bring_to_front()
            return {"ok": True, "reused": True}
        except Exception:  # noqa: BLE001
            SAFE_WINDOWS.pop(workspace_key, None)

    window = webview.create_window(
        f"CommandCentre Safe - Workspace {workspace_key}",
        url="https://pass.proton.me/",
        width=520,
        height=760,
        min_size=(420, 620),
    )
    SAFE_WINDOWS[workspace_key] = window
    return {"ok": True, "reused": False}


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


SAFE_LOCK_PIN_KEY = "safe_lock_pin"
DEFAULT_SAFE_LOCK_PIN = "0000"


def _get_safe_lock_pin_stored() -> str | None:
    """None means no custom row — effective PIN is DEFAULT_SAFE_LOCK_PIN."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT value FROM app_settings WHERE key = ?",
            (SAFE_LOCK_PIN_KEY,),
        ).fetchone()
    if not row:
        return None
    v = row.get("value")
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def get_effective_safe_lock_pin() -> str:
    stored = _get_safe_lock_pin_stored()
    if stored is None:
        return DEFAULT_SAFE_LOCK_PIN
    return stored


def verify_safe_lock_pin(pin: str | None) -> dict:
    entered = "" if pin is None else str(pin)
    expected = get_effective_safe_lock_pin()
    return {"ok": entered == expected}


def set_safe_lock_pin(pin: str | None) -> dict:
    """Empty or whitespace clears the custom PIN (reverts to default)."""
    normalized = "" if pin is None else str(pin).strip()
    with get_connection() as conn:
        if not normalized:
            conn.execute("DELETE FROM app_settings WHERE key = ?", (SAFE_LOCK_PIN_KEY,))
        else:
            conn.execute(
                """
                INSERT INTO app_settings(key, value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
                """,
                (SAFE_LOCK_PIN_KEY, normalized),
            )
        conn.commit()
    return {"ok": True}


def get_integration_settings() -> dict:
    return {
        "tray_enabled": _get_setting_bool("tray_enabled", True),
        "hotkey_enabled": _get_setting_bool("hotkey_enabled", True),
        "hotkey_combo": "Ctrl+K",
        "safe_lock_pin_is_custom": _get_safe_lock_pin_stored() is not None,
    }


def start_integrations() -> dict:
    settings = get_integration_settings()
    tray = _start_tray() if settings["tray_enabled"] else {"ok": True, "message": "Tray disabled by settings."}
    hotkey = (
        register_hotkey(settings["hotkey_combo"], "open_search")
        if settings["hotkey_enabled"]
        else {"ok": True, "message": "Hotkey disabled by settings."}
    )
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

