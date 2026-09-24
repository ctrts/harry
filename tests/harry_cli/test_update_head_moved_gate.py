"""Tests for the post-pull HEAD-movement gate in ``harry update``.

Issue #79678: a detached/pinned checkout can report "N new commit(s)"
against origin, run the ff-only merge successfully, and still sit on the
old commit afterward (the branch-switch step re-detaches to the raw SHA).
Before this guard ``harry update`` printed "✓ Code updated!" and
reinstalled deps + rebuilt the desktop app against the stale tree — no
error, no warning. The gate compares the pre-pull and post-pull HEAD SHA
and fails loudly when the update was a no-op.
"""

from types import SimpleNamespace

import pytest

from harry_cli import main as harry_main
import harry_cli.main_web_build as main_web_build
import harry_cli.main_install_repair as main_install_repair
from harry_cli import update_cmd


def _make_head_pinned_side_effect(sha="abc123"):
    """Simulate a detached checkout pinned to ``sha``: HEAD never moves."""

    def side_effect(cmd, **kwargs):
        joined = " ".join(str(c) for c in cmd)

        if "rev-parse" in joined and "--abbrev-ref" in joined:
            return SimpleNamespace(returncode=0, stdout="HEAD\n", stderr="")

        if "rev-list" in joined:
            return SimpleNamespace(returncode=0, stdout="3\n", stderr="")

        if joined.endswith("rev-parse HEAD"):
            return SimpleNamespace(returncode=0, stdout=f"{sha}\n", stderr="")

        return SimpleNamespace(returncode=0, stdout="", stderr="")

    return side_effect


def _patch_update_deps(monkeypatch, tmp_path, run_side_effect):
    """Patch the harry_cli.main helpers ``_cmd_update_impl`` touches.

    ``_m()`` in update_cmd.py lazily returns harry_cli.main, so patching
    attributes on that module is the canonical test surface (matches
    tests/harry_cli/test_cmd_update.py).
    """
    monkeypatch.setattr(harry_main.subprocess, "run", run_side_effect)
    monkeypatch.setattr(harry_main, "PROJECT_ROOT", tmp_path)
    (tmp_path / ".git").mkdir()  # pass the "is a git repo" gate
    monkeypatch.setattr(harry_main, "_resolve_update_branch", lambda args: "main")
    monkeypatch.setattr(harry_main, "_is_windows", lambda: False)
    monkeypatch.setattr(main_install_repair, "_is_windows", lambda: False)
    monkeypatch.setattr(
        harry_main,
        "_get_origin_url",
        lambda *a, **k: "https://github.com/ctrts/harry.git",
    )
    monkeypatch.setattr(update_cmd, "_is_fork", lambda *a, **k: False)
    monkeypatch.setattr(
        harry_main, "_stash_local_changes_if_needed", lambda *a, **k: None
    )
    monkeypatch.setattr(harry_main, "_clear_bytecode_cache", lambda *a, **k: 0)
    monkeypatch.setattr(
        harry_main, "_record_bytecode_fingerprint", lambda *a, **k: None
    )
    monkeypatch.setattr(
        main_web_build, "_record_bytecode_fingerprint", lambda *a, **k: None
    )
    monkeypatch.setattr(harry_main, "_run_pre_update_backup", lambda *a, **k: None)
    monkeypatch.setattr(harry_main, "_pause_windows_gateways_for_update", lambda: None)
    monkeypatch.setattr(
        harry_main, "_resume_windows_gateways_after_update", lambda *a, **k: None
    )
    # Short-circuit the long tail: dependency install + desktop build.
    monkeypatch.setattr(harry_main, "_write_update_incomplete_marker", lambda: None)
    monkeypatch.setattr(harry_main, "_clear_update_incomplete_marker", lambda: None)
    monkeypatch.setattr(
        main_install_repair, "_clear_update_incomplete_marker", lambda: None
    )
    # Gateway restart path (called after a successful update).
    monkeypatch.setattr(
        update_cmd, "_finish_dashboard_update_cleanup", lambda *a, **k: None
    )
    # Keep the (now surfaced — #78574) gateway auto-restart phase away from
    # this machine's real gateways: discovery returns nothing, systemd is
    # unsupported, so the phase is a clean no-op for both snapshots.
    import harry_cli.gateway as harry_gateway

    monkeypatch.setattr(
        harry_gateway, "find_gateway_pids", lambda all_profiles=False: []
    )
    monkeypatch.setattr(harry_gateway, "supports_systemd_services", lambda: False)
    monkeypatch.setattr(
        harry_gateway, "find_profile_gateway_processes", lambda *a, **k: []
    )


def test_update_fails_loudly_when_head_pinned(monkeypatch, tmp_path, capsys):
    """A detached/pinned HEAD that never moves must fail loudly, not print
    '✓ Code updated!' against the stale tree."""
    args = SimpleNamespace(branch=None, yes=False, force=False, force_venv=False)
    _patch_update_deps(monkeypatch, tmp_path, _make_head_pinned_side_effect())

    with pytest.raises(SystemExit) as exc_info:
        harry_main.cmd_update(args)

    assert exc_info.value.code == 1
    out = capsys.readouterr().out
    assert "✓ Code updated!" not in out
