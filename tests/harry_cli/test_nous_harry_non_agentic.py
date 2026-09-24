"""Tests for the Nous-Harry-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"harry"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``harry-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "harry" tag namespace.

``is_nous_harry_non_agentic`` should only match the actual the Harry project
Harry-3 / Harry-4 chat family.
"""

from __future__ import annotations

import pytest

from harry_cli.model_switch import (
    _HARRY_MODEL_WARNING,
    _check_harry_model_warning,
    is_nous_harry_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "NousResearch/Harry-3-Llama-3.1-70B",
        "NousResearch/Harry-3-Llama-3.1-405B",
        "harry-3",
        "Harry-3",
        "harry-4",
        "harry-4-405b",
        "harry_4_70b",
        "openrouter/harry3:70b",
        "openrouter/nousresearch/harry-4-405b",
        "NousResearch/Harry3",
        "harry-3.1",
    ],
)
def test_matches_real_nous_harry_chat_models(model_name: str) -> None:
    assert is_nous_harry_non_agentic(
        model_name
    ), f"expected {model_name!r} to be flagged as Nous Harry 3/4"
    assert _check_harry_model_warning(model_name) == _HARRY_MODEL_WARNING
