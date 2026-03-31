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
```

### 3) Run

```bash
python -m commandcentre.main
```

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
python -m commandcentre.main
```

# CommandCentre
