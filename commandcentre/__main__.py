"""Entry point for `python -m commandcentre` (used by PyInstaller / AppImage)."""

def _run() -> None:
    # `python -m commandcentre`: __package__ is "commandcentre" → relative import is correct.
    # PyInstaller may run this file with __package__ unset → need absolute import.
    if __package__:
        from .main import main
    else:
        from commandcentre.main import main

    main()


if __name__ == "__main__":
    _run()
