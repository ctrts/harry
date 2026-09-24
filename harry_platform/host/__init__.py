"""Cached facts about the machine running this Python process.

Facts use hardware sources without environment-variable input or subprocesses.
"""

from harry_platform.host.facts import interactive_session

__all__ = ["interactive_session"]
