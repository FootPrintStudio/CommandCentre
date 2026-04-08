# CommandCentre (Linux desktop)

## Quick start (recommended: GTK backend)

PyWebview on Linux requires either **GTK** (via `python3-gi`) or **Qt**.
On Linux Mint/Ubuntu, the smoothest setup is GTK via apt, then a venv that can see system site-packages.

### 1) Install system GTK bindings

```bash
sudo apt update
sudo apt install -y python3-gi gir1.2-gtk-3.0
```

### 2) Recreate venv with system-site-packages

From the repo root:

```bash
rm -rf .venv
python3 -m venv --system-site-packages .venv
source .venv/bin/activate
python -m pip install -r commandcentre/requirements.txt
# Optional: register the package so `python -m commandcentre` works from any directory
python -m pip install -e ".[dev]"
```

### 3) Run

From the **repository root** (the directory that contains the `commandcentre` package folder):

```bash
python -m commandcentre
```

Equivalent:

```bash
python -m commandcentre.main
```

If you see `ModuleNotFoundError: No module named 'webview'`, install dependencies (step 2). If you see `No module named 'commandcentre'`, run from the repo root or install once in editable mode: `pip install -e ".[dev]"` (uses `pyproject.toml`).

### 4) Run tests

```bash
python -m pytest commandcentre/tests -q
```

## Alternative: Qt backend (if you prefer)

If you don’t want GTK, you can use Qt instead, but you’ll need Qt bindings installed in the venv.
One workable combo is `qtpy` + `PyQt6`:

```bash
source .venv/bin/activate
python -m pip install qtpy PyQt6
python -m commandcentre
```

## AppImage (local, always matches your tree)

The packager binary is **not** in git (`packaging/.tools/` is gitignored). To produce an **up-to-date** bundle from whatever is currently checked out:

1. Download **appimagetool** for your arch from [AppImage/appimagetool releases](https://github.com/AppImage/appimagetool/releases).
2. From the repo root:
   ```bash
   mkdir -p packaging/.tools
   mv ~/Downloads/appimagetool-x86_64.AppImage packaging/.tools/
   chmod +x packaging/.tools/appimagetool-x86_64.AppImage
   ./packaging/build_appimage.sh
   ```
3. Installable output: `dist/CommandCentre-<version>-x86_64.AppImage` (version comes from `commandcentre/__init__.py`).

The script recreates the build venv and runs PyInstaller each time, so the AppImage reflects your latest code without committing the builder.
