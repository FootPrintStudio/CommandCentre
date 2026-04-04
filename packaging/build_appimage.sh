#!/usr/bin/env bash
# Build CommandCentre-x86_64.AppImage (Linux x86_64).
#
# Prerequisites: Python 3.11+, and the standalone appimagetool from:
#   https://github.com/AppImage/appimagetool
# Download a release AppImage (e.g. appimagetool-x86_64.AppImage), chmod +x, then either:
#   - Put it on PATH as `appimagetool`, or
#   - Point APPIMAGETOOL at the file, e.g.:
#       APPIMAGETOOL="$HOME/.local/bin/appimagetool-x86_64.AppImage" ./packaging/build_appimage.sh
# (This replaces the legacy tool from the old AppImageKit repo.)
#
# Development workflow (unchanged): use a normal venv and run:
#   pip install -r commandcentre/requirements.txt
#   python -m commandcentre
#
# This script uses a separate venv (default: .venv-appimage) so your dev .venv is untouched.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUILD_VENV="${BUILD_VENV:-$ROOT/.venv-appimage}"
DIST_PY="$ROOT/dist/commandcentre"
APPDIR="$ROOT/dist/CommandCentre.AppDir"
ARCH_NAME="${ARCH:-$(uname -m)}"

if [[ "$ARCH_NAME" != "x86_64" ]]; then
  echo "This script is tested for x86_64; ARCH=$ARCH_NAME (set ARCH if cross-building)." >&2
fi

# Resolve appimagetool: https://github.com/AppImage/appimagetool
APPIMAGETOOL_BIN=""
if [[ -n "${APPIMAGETOOL:-}" ]]; then
  if [[ ! -f "$APPIMAGETOOL" ]]; then
    echo "APPIMAGETOOL is set but file not found: $APPIMAGETOOL" >&2
    exit 1
  fi
  if [[ ! -x "$APPIMAGETOOL" ]]; then
    echo "APPIMAGETOOL is not executable: $APPIMAGETOOL (run chmod +x)" >&2
    exit 1
  fi
  APPIMAGETOOL_BIN="$(readlink -f "$APPIMAGETOOL")"
elif command -v appimagetool >/dev/null 2>&1; then
  APPIMAGETOOL_BIN="$(command -v appimagetool)"
else
  echo "appimagetool not found. Install the standalone release from:" >&2
  echo "  https://github.com/AppImage/appimagetool/releases" >&2
  echo "Then chmod +x the downloaded appimagetool-x86_64.AppImage (or your arch) and either add it to PATH as" >&2
  echo "'appimagetool' or set APPIMAGETOOL to its full path when running this script." >&2
  exit 1
fi

echo "==> Build venv: $BUILD_VENV"
python3 -m venv "$BUILD_VENV"
# shellcheck source=/dev/null
source "$BUILD_VENV/bin/activate"
pip install -U pip wheel
pip install -r "$ROOT/commandcentre/requirements.txt"
pip install pyinstaller

if [[ -f "$ROOT/tools/apply_pywebview_qt_permission_patch.py" ]]; then
  echo "==> Optional pywebview Qt patch"
  python "$ROOT/tools/apply_pywebview_qt_permission_patch.py" || true
fi

mkdir -p "$ROOT/packaging/.build"
echo "==> Generate icon"
python << 'PY'
from pathlib import Path

from PIL import Image, ImageDraw

out = Path("packaging/.build")
out.mkdir(parents=True, exist_ok=True)
img = Image.new("RGBA", (256, 256), (15, 23, 42, 255))
draw = ImageDraw.Draw(img)
draw.rectangle((32, 32, 224, 224), outline=(56, 189, 248, 255), width=8)
draw.rectangle((96, 96, 160, 160), fill=(16, 185, 129, 255))
img.save(out / "commandcentre.png")
PY

echo "==> PyInstaller"
rm -rf "$ROOT/build" "$ROOT/dist/commandcentre"
pyinstaller "$ROOT/packaging/CommandCentre.spec" --clean --noconfirm

if [[ ! -x "$DIST_PY/commandcentre" ]]; then
  echo "Expected executable missing: $DIST_PY/commandcentre" >&2
  exit 1
fi

echo "==> AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib/cc-bundle"
cp -a "$DIST_PY"/. "$APPDIR/usr/lib/cc-bundle/"

mkdir -p "$APPDIR/usr/share/applications"
mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"
cp "$ROOT/packaging/.build/commandcentre.png" "$APPDIR/commandcentre.png"
cp "$ROOT/packaging/.build/commandcentre.png" "$APPDIR/usr/share/icons/hicolor/256x256/apps/commandcentre.png"
cp "$ROOT/packaging/commandcentre.desktop" "$APPDIR/commandcentre.desktop"
cp "$ROOT/packaging/commandcentre.desktop" "$APPDIR/usr/share/applications/commandcentre.desktop"
ln -sf "usr/share/icons/hicolor/256x256/apps/commandcentre.png" "$APPDIR/.DirIcon"

VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' commandcentre/__init__.py | head -1)"
if [[ -z "$VERSION" ]]; then VERSION="0.0.0"; fi
export VERSION
OUT="$ROOT/dist/CommandCentre-${VERSION}-${ARCH_NAME}.AppImage"

cat > "$APPDIR/AppRun" << 'WRAP'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
BUNDLE="$HERE/usr/lib/cc-bundle"
export PATH="$HERE/usr/bin:${PATH}"

if [[ -d "$BUNDLE/PyQt6/Qt6/plugins" ]]; then
  export QT_PLUGIN_PATH="$BUNDLE/PyQt6/Qt6/plugins${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"
fi
QTP="$(find "$BUNDLE" -name QtWebEngineProcess -type f 2>/dev/null | head -1)"
if [[ -n "$QTP" ]]; then
  export QTWEBENGINEPROCESS_PATH="$QTP"
fi

cd "$BUNDLE" || exit 1
exec ./commandcentre "$@"
WRAP
chmod +x "$APPDIR/AppRun"

cp "$APPDIR/AppRun" "$APPDIR/commandcentre"
chmod +x "$APPDIR/commandcentre"

echo "==> appimagetool ($APPIMAGETOOL_BIN) -> $OUT"
rm -f "$OUT"
# ARCH is read by appimagetool when it cannot infer the bundle architecture (see appimagetool docs).
ARCH="$ARCH_NAME" "$APPIMAGETOOL_BIN" --no-appstream "$APPDIR" "$OUT"
chmod +x "$OUT"
echo "Done: $OUT"
