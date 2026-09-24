"""Resolve HARRY_HOME for standalone skill scripts.

Skill scripts may run outside the Harry process (system Python, nix env,
CI) where ``harry_constants`` is not importable.  This module provides the
same ``get_harry_home()`` contract without requiring it on ``sys.path``.

When ``harry_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from harry_constants import get_harry_home as get_harry_home
except (ModuleNotFoundError, ImportError):

    def get_harry_home() -> Path:
        """Return the Harry home directory (default: ``~/.harry``)."""
        val = os.environ.get("HARRY_HOME", "").strip()
        return Path(val) if val else Path.home() / ".harry"
