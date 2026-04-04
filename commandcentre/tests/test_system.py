from commandcentre.api import CommandCentreAPI
from commandcentre.db import initialize_database


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
