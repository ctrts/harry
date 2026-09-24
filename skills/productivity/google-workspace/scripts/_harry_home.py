"""Resolve HARRY_HOME for standalone skill scripts.

Skill scripts may run outside the Harry process (e.g. system Python,
nix env, CI) where ``harry_constants`` is not importable.  This module
provides the same ``get_harry_home()`` and ``display_harry_home()``
contracts as ``harry_constants`` without requiring it on ``sys.path``.

When ``harry_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``harry_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``HARRY_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from harry_constants import display_harry_home as display_harry_home
    from harry_constants import get_harry_home as get_harry_home
except (ModuleNotFoundError, ImportError):

    def get_harry_home() -> Path:
        """Return the Harry home directory (default: ~/.harry).

        Mirrors ``harry_constants.get_harry_home()``."""
        val = os.environ.get("HARRY_HOME", "").strip()
        return Path(val) if val else Path.home() / ".harry"

    def display_harry_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``harry_constants.display_harry_home()``."""
        home = get_harry_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
