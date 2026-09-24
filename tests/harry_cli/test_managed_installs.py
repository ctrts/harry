from types import SimpleNamespace
from unittest.mock import patch

import pytest

from harry_cli.config import get_managed_system, is_managed, recommended_update_command
from harry_cli.main import cmd_update
from tools.skills_hub_official import OptionalSkillSource


def test_recommended_update_command_defaults_to_harry_update(monkeypatch):
    monkeypatch.delenv("HARRY_MANAGED", raising=False)

    # Also short-circuit the .managed marker path — CI runners may have an
    # ambient ~/.harry/.managed if a prior test left HARRY_HOME pointing
    # somewhere with that marker, which would make get_managed_update_command()
    # return "Update your Nix flake input ..." instead of falling through to
    # detect_install_method().
    with patch("harry_cli.config.get_managed_update_command", return_value=None), patch(
        "harry_cli.config.detect_install_method", return_value="git"
    ):
        assert recommended_update_command() == "harry update"


@pytest.mark.parametrize("false_value", ["false", "0", "no", "off", "FALSE"])
def test_get_managed_system_false_values(monkeypatch, false_value):
    """An explicit opt-out is not a package manager named "false" (#12864)."""
    monkeypatch.setenv("HARRY_MANAGED", false_value)

    assert get_managed_system() is None
    assert not is_managed()
    with patch("harry_cli.config.detect_install_method", return_value="git"):
        assert recommended_update_command() == "harry update"


def test_optional_skill_source_honors_env_override(monkeypatch, tmp_path):
    optional_dir = tmp_path / "optional-skills"
    optional_dir.mkdir()
    monkeypatch.setenv("HARRY_OPTIONAL_SKILLS", str(optional_dir))

    source = OptionalSkillSource()

    assert source._optional_dir == optional_dir
