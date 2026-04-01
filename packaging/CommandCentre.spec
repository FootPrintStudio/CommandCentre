# PyInstaller spec for CommandCentre (Linux Qt / pywebview).
# Run from repo root:  pyinstaller packaging/CommandCentre.spec
# Or use:  ./packaging/build_appimage.sh

from pathlib import Path

from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPEC).resolve().parent.parent

added_datas: list = []
added_binaries: list = []
added_hiddenimports: list = []

for pkg in ("PyQt6", "pywebview", "PIL", "pystray", "pynput"):
    try:
        d, b, h = collect_all(pkg)
        added_datas += d
        added_binaries += b
        added_hiddenimports += h
    except Exception:
        pass

block_cipher = None

a = Analysis(
    [str(ROOT / "commandcentre" / "__main__.py")],
    pathex=[str(ROOT)],
    binaries=added_binaries,
    datas=[
        (str(ROOT / "commandcentre" / "templates"), "commandcentre/templates"),
        *added_datas,
    ],
    hiddenimports=list(
        dict.fromkeys(
            added_hiddenimports
            + [
                "webview.platforms.qt",
                "bottle",
                "PIL.Image",
                "PIL.ImageDraw",
                "Xlib",
                "Xlib.display",
                "Xlib.X",
                "Xlib.XK",
                "Xlib.ext",
                "six",
            ]
        )
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="commandcentre",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="commandcentre",
)
