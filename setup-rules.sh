#!/usr/bin/env bash
set -euo pipefail

# nextc-claude setup — symlinks rules into ~/.claude/rules/nextc-claude/
# Agents and skills are installed via marketplace (/plugin marketplace add + /plugin install).
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

# Configure repo-local git hooks (pre-commit runs validate.js)
if [ -d "$REPO_DIR/.git" ] && [ -d "$REPO_DIR/.githooks" ]; then
  current="$(git -C "$REPO_DIR" config core.hooksPath || true)"
  if [ "$current" = ".githooks" ]; then
    echo "✓ git core.hooksPath already set to .githooks"
  else
    git -C "$REPO_DIR" config core.hooksPath .githooks
    echo "✓ Configured git core.hooksPath → .githooks (pre-commit will run validate.js)"
  fi
fi

echo ""
echo "Done! Rules symlinked. For agents and skills, run in Claude Code:"
echo "  /plugin marketplace add nextc/nextc-claude"
echo "  /plugin install nextc-core@nextc-claude"
echo "  /plugin install nextc-product@nextc-claude"
echo "  /plugin install nextc-project-kickoff@nextc-claude"
echo "  /plugin install nextc-flutter@nextc-claude"
echo "  /plugin install nextc-aso@nextc-claude"
