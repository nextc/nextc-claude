#!/usr/bin/env bash
set -euo pipefail

# dotclaude setup — symlinks custom Claude Code config from this repo into ~/.claude/
# Run this on a new machine after cloning the repo.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

# --- Directory-level symlinks (agents, rules) ---
# These use a single "custom" directory symlink.
DIR_LINKS=(
  "agents/custom"
  "rules/custom"
)

for dir in "${DIR_LINKS[@]}"; do
  src="$REPO_DIR/$dir"
  dest="$CLAUDE_DIR/$dir"

  if [ -L "$dest" ]; then
    echo "✓ $dest is already a symlink → $(readlink "$dest")"
    continue
  fi

  if [ -d "$dest" ]; then
    echo "⚠ $dest exists as a regular directory."
    echo "  Backing up to ${dest}.bak and replacing with symlink."
    mv "$dest" "${dest}.bak"
  fi

  mkdir -p "$(dirname "$dest")"
  ln -s "$src" "$dest"
  echo "✓ Linked $dest → $src"
done

# --- Per-item symlinks (skills) ---
# Claude Code expects each skill as its own directory with SKILL.md inside.
# We symlink each skill directory individually into ~/.claude/skills/.
if [ -d "$REPO_DIR/skills" ]; then
  mkdir -p "$CLAUDE_DIR/skills"
  for skill_dir in "$REPO_DIR/skills"/*/; do
    skill_name="$(basename "$skill_dir")"
    src="$REPO_DIR/skills/$skill_name"
    dest="$CLAUDE_DIR/skills/$skill_name"

    if [ -L "$dest" ]; then
      echo "✓ $dest is already a symlink → $(readlink "$dest")"
      continue
    fi

    if [ -d "$dest" ]; then
      echo "⚠ $dest exists as a regular directory."
      echo "  Backing up to ${dest}.bak and replacing with symlink."
      mv "$dest" "${dest}.bak"
    fi

    ln -s "$src" "$dest"
    echo "✓ Linked $dest → $src"
  done
fi

echo ""
echo "Done! Your custom Claude Code config is now symlinked from this repo."
