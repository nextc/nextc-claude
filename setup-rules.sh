#!/usr/bin/env bash
set -euo pipefail

# dotclaude setup — symlinks rules into ~/.claude/rules/nextc-claude/
# Agents and skills are installed via marketplace (claude install-skillpack).
# Rules have no plugin support, so they still require this symlink.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

src="$REPO_DIR/rules/nextc-claude"
dest="$CLAUDE_DIR/rules/nextc-claude"

if [ -L "$dest" ]; then
  echo "✓ $dest is already a symlink → $(readlink "$dest")"
elif [ -d "$dest" ]; then
  echo "⚠ $dest exists as a regular directory."
  echo "  Backing up to ${dest}.bak and replacing with symlink."
  mv "$dest" "${dest}.bak"
  ln -s "$src" "$dest"
  echo "✓ Linked $dest → $src"
else
  mkdir -p "$(dirname "$dest")"
  ln -s "$src" "$dest"
  echo "✓ Linked $dest → $src"
fi

echo ""
echo "Done! Rules symlinked. For agents and skills, run:"
echo "  claude install-skillpack github:nextc/nextc-claude"
