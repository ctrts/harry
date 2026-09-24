"""Standalone-vs-served parity for the cron subsystem under ``gateway.multiplex_profiles``.

A profile served by the default multiplexer runs its ticks inside the default profile's process:
``os.environ`` holds the DEFAULT profile's ``.env`` and the served profile's values exist only
in its secret scope / home override. Every knob cron reads from ``.env`` and every child env it
builds must resolve exactly as it would under a standalone ``harry -p <name> gateway run``.
"""

from pathlib import Path

import pytest

from agent.secret_scope import (
    build_profile_secret_scope,
    reset_secret_scope,
    set_multiplex_active,
    set_secret_scope,
)
from harry_constants import reset_harry_home_override, set_harry_home_override


@pytest.fixture
def two_homes(tmp_path, monkeypatch):
    root = tmp_path / "harry"
    alpha = root / "profiles" / "alpha"
    for home in (root, alpha):
        (home / "cron").mkdir(parents=True)
    (root / ".env").write_text(
        "HARRY_CRON_TIMEOUT=111\nHARRY_MODEL=default-model\nTERMINAL_ENV=docker\n"
        "TERMINAL_DOCKER_IMAGE=default-only-image\nHARRY_LANGUAGE=en\n"
    )
    (alpha / ".env").write_text("HARRY_CRON_TIMEOUT=222\nHARRY_LANGUAGE=zh\n")
    # The launch (default) profile's .env is what the multiplexer process loaded into os.environ.
    monkeypatch.setenv("HARRY_HOME", str(root))
    for key, val in (
        ("HARRY_CRON_TIMEOUT", "111"),
        ("HARRY_MODEL", "default-model"),
        ("TERMINAL_ENV", "docker"),
        ("TERMINAL_DOCKER_IMAGE", "default-only-image"),
        ("HARRY_LANGUAGE", "en"),
    ):
        monkeypatch.setenv(key, val)
    set_multiplex_active(True)
    home_token = set_harry_home_override(str(alpha))
    try:
        yield root, alpha
    finally:
        reset_harry_home_override(home_token)
        set_multiplex_active(False)


def test_cron_env_settings_resolve_from_the_served_profile(two_homes):
    """``HARRY_CRON_TIMEOUT`` / ``HARRY_MODEL`` are alpha's (or absent) both with the fire-time
    secret scope installed and on the bare tick thread — never the default profile's environ.
    """
    import cron.scheduler as sched
    from cron.jobs import _oneshot_run_claim_ttl_seconds
    from cron.scheduler_preflight import _preflight_check_provider_key

    root, alpha = two_homes
    captured = {}

    def fake_resolve(**kw):
        captured.update(kw)
        return {}

    import harry_cli.runtime_provider as rp

    original = rp.resolve_runtime_provider
    rp.resolve_runtime_provider = fake_resolve
    try:
        # Tick thread: home override only (due-job scan, pool sizing, claim TTL).
        assert sched._cron_inactivity_seconds() == 222.0
        assert (
            _oneshot_run_claim_ttl_seconds() == 1800.0
        )  # 222*3 < floor -> floor, from alpha's value
        # Fire: secret scope installed as _run_one_job_body does.
        token = set_secret_scope(build_profile_secret_scope(alpha))
        try:
            assert sched._cron_inactivity_seconds() == 222.0
            _preflight_check_provider_key({"id": "j"}, {"cron": {}})
            assert (
                captured["target_model"] == ""
            )  # alpha has no HARRY_MODEL; default's must not leak
            with pytest.raises(RuntimeError, match="no model configured"):
                sched._load_cron_job_config(
                    {"id": "j", "name": "j", "prompt": "x"}, "j", "j"
                )
        finally:
            reset_secret_scope(token)
    finally:
        rp.resolve_runtime_provider = original


def test_child_env_for_served_profile_drops_launch_profile_settings(two_homes):
    """A worker/bot-chat child spawned for served alpha must not inherit the default profile's
    non-credential ``.env`` settings or bridged ``TERMINAL_*`` policy — a standalone alpha never
    had them. Alpha's own home pin and non-profile env survive."""
    from tools.environments.local import build_subprocess_env, strip_launch_profile_env

    root, alpha = two_homes
    token = set_secret_scope(build_profile_secret_scope(alpha))
    try:
        env = strip_launch_profile_env(
            build_subprocess_env(scrub_secrets=True, inherit_profile_home=True)
        )
    finally:
        reset_secret_scope(token)
    for key in (
        "HARRY_MODEL",
        "TERMINAL_ENV",
        "TERMINAL_DOCKER_IMAGE",
        "HARRY_LANGUAGE",
        "HARRY_CRON_TIMEOUT",
    ):
        assert key not in env, key
    assert env["HARRY_HOME"] == str(alpha)
    assert "PATH" in env

    # No-op when the scope IS the launch profile (standalone / default profile's own children).
    reset_harry_home_override(set_harry_home_override(None))
    home_token = set_harry_home_override(str(root))
    try:
        env = strip_launch_profile_env(
            build_subprocess_env(scrub_secrets=True, inherit_profile_home=True)
        )
    finally:
        reset_harry_home_override(home_token)
    assert env["TERMINAL_ENV"] == "docker"
    assert env["HARRY_MODEL"] == "default-model"
