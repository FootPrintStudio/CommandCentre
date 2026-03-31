"""
Pytest must not use the developer database under commandcentre/database/,
or test workspaces accumulate in the same file the app uses on the next launch.
"""
from __future__ import annotations

import os
import tempfile

if not os.environ.get("COMMANDCENTRE_DATABASE_PATH"):
    _fd, _path = tempfile.mkstemp(prefix="commandcentre-test-", suffix=".db")
    os.close(_fd)
    os.environ["COMMANDCENTRE_DATABASE_PATH"] = _path
