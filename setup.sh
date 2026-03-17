#!/usr/bin/env bash
set -euo pipefail

# dotclaude setup — symlinks custom Claude Code config from this repo into ~/.claude/
# Run this on a new machine after cloning the repo.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

DIRS=(
  "agents/custom"
  "rules/custom"
  "skills/custom"
)

for dir in "${DIRS[@]}"; do
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

  # Ensure parent directory exists
  mkdir -p "$(dirname "$dest")"

  ln -s "$src" "$dest"
  echo "✓ Linked $dest → $src"
done

echo ""
echo "Done! Your custom Claude Code config is now symlinked from this repo."
