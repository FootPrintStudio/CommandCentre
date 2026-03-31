from commandcentre.api import CommandCentreAPI
from commandcentre.db import initialize_database
from commandcentre import system


def test_integration_settings_persist_toggle_states():
    initialize_database()
    api = CommandCentreAPI()

    defaults = api.get_integration_settings()
    assert "tray_enabled" in defaults
    assert "hotkey_enabled" in defaults

    tray_result = api.set_tray_enabled(False)
    hotkey_result = api.set_hotkey_enabled(False)
    assert tray_result.get("ok") is True
    assert hotkey_result.get("ok") is True

    after = api.get_integration_settings()
    assert after["tray_enabled"] is False
    assert after["hotkey_enabled"] is False


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
