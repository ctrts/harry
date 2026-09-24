#!/usr/bin/env python3
"""Full rebrand of harry-agent -> harry. Renames dirs/files and replaces
all 'harry'/'Harry'/'HARRY' identifiers with 'harry'/'Harry'/'HARRY'.
Excludes venv/, node_modules/, .git/."""

import os, re, shutil, sys
from pathlib import Path

ROOT = Path("/home/ctr/harry-repo")
EXCLUDE_DIRS = {"venv", "node_modules", ".git", "__pycache__"}

# Order matters: do longer/more-specific replacements first to avoid partial hits.
# We replace case-variants independently.
REPLACEMENTS = [
    # env vars (uppercase)
    ("HARRY_DESKTOP_APP_NAME", "HARRY_DESKTOP_APP_NAME"),
    ("HARRY_HOME_OVERRIDE", "HARRY_HOME_OVERRIDE"),
    ("HARRY_HOME", "HARRY_HOME"),
    ("HARRY_", "HARRY_"),  # any other HARRY_* env var
    # module/package names (snake_case) - do before generic lowercase
    ("harry_agent", "harry_agent"),
    ("harry_cli", "harry_cli"),
    ("harry_constants", "harry_constants"),
    ("harry_bootstrap", "harry_bootstrap"),
    ("harry_logging", "harry_logging"),
    ("harry_platform", "harry_platform"),
    ("harry_startup_watchdog", "harry_startup_watchdog"),
    ("harry_state", "harry_state"),
    ("harry_time", "harry_time"),
    ("harry-agent", "harry-agent"),
    ("harry.exe", "harry.exe"),
    # Title Case branding
    ("Harry", "Harry"),
    # remaining lowercase (package dir, generic refs)
    ("harry", "harry"),
]


def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & EXCLUDE_DIRS)


def rename_paths():
    """Rename harry* dirs and files to harry*."""
    renamed = 0
    # Walk top-down; rename directories and files starting with 'harry'
    for dirpath, dirnames, filenames in os.walk(ROOT, topdown=True):
        dp = Path(dirpath)
        if should_skip(dp):
            dirnames[:] = []
            continue
        # rename subdirs
        new_dirnames = []
        for d in dirnames:
            if d.lower().startswith("harry"):
                nd = d.replace("harry", "harry").replace("Harry", "Harry")
                try:
                    os.rename(dp / d, dp / nd)
                    renamed += 1
                except OSError as e:
                    print(f"  ! dir rename {dp/d}: {e}", file=sys.stderr)
            new_dirnames.append(
                d if not d.lower().startswith("harry") else d.replace("harry", "harry")
            )
        dirnames[:] = new_dirnames
        # rename files
        for f in filenames:
            if f.lower().startswith("harry"):
                nf = f.replace("harry", "harry").replace("Harry", "Harry")
                try:
                    os.rename(dp / f, dp / nf)
                    renamed += 1
                except OSError as e:
                    print(f"  ! file rename {dp/f}: {e}", file=sys.stderr)
    print(f"Renamed {renamed} paths")


def replace_content():
    """Replace harry->harry in text file contents."""
    count_files = 0
    count_repl = 0
    text_exts = {
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".json",
        ".yaml",
        ".yml",
        ".md",
        ".toml",
        ".cfg",
        ".ini",
        ".sh",
        ".ps1",
        ".bat",
        ".txt",
        ".html",
        ".css",
        ".mjs",
        ".cjs",
        ".vue",
        ".svelte",
        ".rst",
        ".example",
    }
    for dirpath, dirnames, filenames in os.walk(ROOT, topdown=True):
        dp = Path(dirpath)
        if should_skip(dp):
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for f in filenames:
            fp = dp / f
            ext = fp.suffix.lower()
            if ext not in text_exts and not f.endswith(".example"):
                continue
            try:
                content = fp.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue  # binary or unreadable
            orig = content
            for old, new in REPLACEMENTS:
                content = content.replace(old, new)
            if content != orig:
                try:
                    fp.write_text(content, encoding="utf-8")
                    count_files += 1
                    count_repl += 1
                except OSError as e:
                    print(f"  ! write {fp}: {e}", file=sys.stderr)
    print(f"Updated {count_files} files")


if __name__ == "__main__":
    print("=== Phase 1: rename paths ===")
    rename_paths()
    print("=== Phase 2: replace content ===")
    replace_content()
    print("=== Rebrand complete ===")
