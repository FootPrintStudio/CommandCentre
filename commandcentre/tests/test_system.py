import json

from commandcentre.api import CommandCentreAPI
from commandcentre.db import initialize_database
from commandcentre import system


def test_integration_settings_persist_toggle_states():
    initialize_database()
    api = CommandCentreAPI()

    defaults = api.get_integration_settings()
    assert "tray_enabled" in defaults
    assert "hotkey_enabled" in defaults
    assert "safe_lock_pin_is_custom" in defaults
    assert defaults["safe_lock_pin_is_custom"] is False

    tray_result = api.set_tray_enabled(False)
    hotkey_result = api.set_hotkey_enabled(False)
    assert tray_result.get("ok") is True
    assert hotkey_result.get("ok") is True

    after = api.get_integration_settings()
    assert after["tray_enabled"] is False
    assert after["hotkey_enabled"] is False


def test_safe_lock_pin_default_verify_and_custom_set():
    initialize_database()
    api = CommandCentreAPI()
    assert api.verify_safe_lock_pin("0000") == {"ok": True}
    assert api.verify_safe_lock_pin("wrong") == {"ok": False}
    api.set_safe_lock_pin("secret12")
    assert api.get_integration_settings()["safe_lock_pin_is_custom"] is True
    assert api.verify_safe_lock_pin("secret12") == {"ok": True}
    assert api.verify_safe_lock_pin("0000") == {"ok": False}
    api.set_safe_lock_pin("")
    assert api.get_integration_settings()["safe_lock_pin_is_custom"] is False
    assert api.verify_safe_lock_pin("0000") == {"ok": True}


def test_safe_cli_get_item_merges_card_and_login_buckets(monkeypatch):
    """Sparse Login + Card must both contribute fields (bank cards, etc.)."""
    payload = {
        "item": {
            "content": {
                "title": "My Visa",
                "content": {
                    "Login": {"urls": []},
                    "Card": {
                        "number": "4111111111111111",
                        "cardholderName": "Jane Doe",
                        "expirationDate": "12/30",
                        "verificationNumber": "123",
                    },
                },
            },
            "state": "Active",
        }
    }

    def fake_run(args):
        if args[:2] == ["item", "view"] and "json" in args:
            return True, json.dumps(payload), ""
        return False, "", "bad args"

    monkeypatch.setattr(system, "_run_pass_cli", fake_run)
    monkeypatch.setattr(system.shutil, "which", lambda _: "/usr/bin/pass-cli")

    result = system.safe_cli_get_item("vault-1", "item-1")
    assert result["ok"] is True
    f = result["item"]["fields"]
    assert f.get("Number") == "4111111111111111"
    assert f.get("Cardholder Name") == "Jane Doe"
    assert f.get("Expiration Date") == "12/30"
    assert f.get("Verification Number") == "123"
    assert f.get("state") == "Active"


def test_safe_cli_create_note_uses_note_subcommand(monkeypatch):
    calls = []

    def fake_run(args):
        calls.append(args)
        return True, "created", ""

    monkeypatch.setattr(system, "_run_pass_cli", fake_run)
    monkeypatch.setattr(system.shutil, "which", lambda _: "/usr/bin/pass-cli")

    result = system.safe_cli_create_note("vault-1", "My Note", "secret")
    assert result["ok"] is True
    assert calls, "Expected at least one pass-cli invocation"
    assert calls[0][:3] == ["item", "create", "note"]
