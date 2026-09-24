"""Regression tests for #34107 — Docker UID/GID handling in ensure_harry_home.

When Harry runs in Docker with ``HARRY_UID=1000`` / ``HARRY_GID=911``,
the entrypoint chowns the top-level ``HARRY_HOME`` once at startup. But
subdirectories created at runtime by ``ensure_harry_home()`` — especially
for profile namespaces under ``profiles/<name>/`` spawned by kanban
workers — were landing as ``root:root`` and blocking subsequent
uid-mapped worker invocations with ``PermissionError [Errno 13]``.

The fix is a ``_chown_to_harry_uid`` helper (``harry_constants``, the single home of the
managed/container/HARRY_UID policy) that reads the env vars and applies chown after
``mkdir``, invoked from ``_secure_dir`` via ``apply_secure_dir_policy`` (which already
runs after every directory creation in the home-init path).
"""

from __future__ import annotations

import sys
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# _resolve_harry_uid_gid
# ---------------------------------------------------------------------------


class TestResolveHarryUidGid:
    def test_returns_parsed_values_when_both_set(self, monkeypatch):
        monkeypatch.setenv("HARRY_UID", "1000")
        monkeypatch.setenv("HARRY_GID", "911")
        from harry_constants import _resolve_harry_uid_gid

        uid, gid = _resolve_harry_uid_gid()
        assert uid == 1000
        assert gid == 911

    # ``windows_only`` rather than ``skipif(sys.platform != "win32")``: the
    # Windows CI job selects ``-m windows_only``, so a bare skipif would leave
    # this test skipped on Linux AND unselected on the Windows lane — dead on
    # every host.
    @pytest.mark.windows_only
    def test_windows_returns_none_none(self, monkeypatch):
        monkeypatch.setenv("HARRY_UID", "1000")
        monkeypatch.setenv("HARRY_GID", "911")
        from harry_constants import _resolve_harry_uid_gid

        uid, gid = _resolve_harry_uid_gid()
        assert uid is None
        assert gid is None


# ---------------------------------------------------------------------------
# _chown_to_harry_uid
# ---------------------------------------------------------------------------


class TestChownToHarryUid:

    def test_eperm_is_silently_swallowed(self, tmp_path, monkeypatch):
        """When running as non-root, os.chown raises EPERM. That's fine —
        the entrypoint's startup chown -R will pick it up on restart, and
        in most cases the dir was already correctly-owned by the calling
        user anyway."""
        monkeypatch.setenv("HARRY_UID", "1000")
        monkeypatch.setenv("HARRY_GID", "911")
        import harry_constants as cfg

        d = tmp_path / "subdir"
        d.mkdir()

        def _raises_eperm(*args, **kwargs):
            raise PermissionError("operation not permitted")

        with patch.object(cfg.os, "chown", side_effect=_raises_eperm):
            # Must not raise — the catch is non-fatal.
            cfg._chown_to_harry_uid(d)


# ---------------------------------------------------------------------------
# End-to-end: _secure_dir now also chowns
# ---------------------------------------------------------------------------


class TestSecureDirChown:
    @pytest.mark.skipif(sys.platform == "win32", reason="chown is no-op on Windows")
    def test_secure_dir_invokes_chown_when_env_set(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HARRY_UID", "1000")
        monkeypatch.setenv("HARRY_GID", "911")
        from harry_cli import config as cfg

        d = tmp_path / "subdir"
        d.mkdir()

        with patch.object(cfg.os, "chown") as mock_chown:
            cfg._secure_dir(d)
        mock_chown.assert_called_once_with(d, 1000, 911)

    @pytest.mark.skipif(sys.platform == "win32", reason="chown is no-op on Windows")
    def test_secure_dir_no_chown_when_env_unset(self, tmp_path, monkeypatch):
        monkeypatch.delenv("HARRY_UID", raising=False)
        monkeypatch.delenv("HARRY_GID", raising=False)
        from harry_cli import config as cfg

        d = tmp_path / "subdir"
        d.mkdir()

        with patch.object(cfg.os, "chown") as mock_chown:
            cfg._secure_dir(d)
        mock_chown.assert_not_called()
