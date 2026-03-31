#!/usr/bin/env python3
"""
PyQt6.11+ expects QWebEnginePage.PermissionPolicy enums for setFeaturePermission(),
not raw ints. Stock pywebview 6.1 still passes 1/2 and crashes with:

  TypeError: ... argument 3 has unexpected type 'int'

Run after `pip install` if CommandCentre aborts on the Qt WebEngine permission callback:

  python tools/apply_pywebview_qt_permission_patch.py
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


OLD = """            def onFeaturePermissionRequested(self, url, feature):
                if feature in (
                    QWebPage.Feature.MediaAudioCapture,
                    QWebPage.Feature.MediaVideoCapture,
                    QWebPage.Feature.MediaAudioVideoCapture,
                ):
                    self.setFeaturePermission(url, feature, 1)  # QWebPage.PermissionGrantedByUser
                else:
                    self.setFeaturePermission(url, feature, 2)  # QWebPage.PermissionDeniedByUser"""

NEW = """            def onFeaturePermissionRequested(self, url, feature):
                if feature in (
                    QWebPage.Feature.MediaAudioCapture,
                    QWebPage.Feature.MediaVideoCapture,
                    QWebPage.Feature.MediaAudioVideoCapture,
                ):
                    self.setFeaturePermission(
                        url,
                        feature,
                        QWebPage.PermissionPolicy.PermissionGrantedByUser,
                    )
                else:
                    self.setFeaturePermission(
                        url,
                        feature,
                        QWebPage.PermissionPolicy.PermissionDeniedByUser,
                    )"""


def main() -> int:
    spec = importlib.util.find_spec("webview")
    if spec is None or not spec.origin:
        print("webview is not installed.", file=sys.stderr)
        return 1
    qt_py = Path(spec.origin).resolve().parent / "platforms" / "qt.py"
    if not qt_py.is_file():
        print(f"Expected pywebview qt backend at {qt_py}", file=sys.stderr)
        return 1
    text = qt_py.read_text(encoding="utf-8")
    if "PermissionPolicy.PermissionGrantedByUser" in text:
        print(f"Already patched: {qt_py}")
        return 0
    if OLD not in text:
        print(
            f"Patch pattern not found (pywebview layout changed?). Edit manually: {qt_py}",
            file=sys.stderr,
        )
        return 1
    qt_py.write_text(text.replace(OLD, NEW), encoding="utf-8")
    print(f"Patched: {qt_py}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
