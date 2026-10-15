#!/usr/bin/env bash
set -euo pipefail

# nextc-claude setup — symlinks rules into ~/.claude/rules/nextc-claude/ and their long-form
# references into ~/.claude/nextc-claude-references/.
# Agents and skills are installed via marketplace (/plugin marketplace add + /plugin install).
# Rules have no plugin support, so they still require this symlink.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

link() {
  local src="$1" dest="$2"
  if [ -L "$dest" ]; then
    echo "✓ $dest is already a symlink → $(readlink "$dest")"
  elif [ -e "$dest" ]; then
    local backup="${dest}.bak.$(date +%Y%m%d%H%M%S)"
    echo "⚠ $dest exists and is not a symlink."
    echo "  Backing up to $backup and replacing with symlink."
    mv "$dest" "$backup"
    ln -s "$src" "$dest"
    echo "✓ Linked $dest → $src"
  else
    mkdir -p "$(dirname "$dest")"
    ln -s "$src" "$dest"
    echo "✓ Linked $dest → $src"
  fi
}

link "$REPO_DIR/rules/nextc-claude" "$CLAUDE_DIR/rules/nextc-claude"
# EXTERNAL: kept outside ~/.claude/rules/ on purpose — Claude Code loads every .md under rules/
# (subfolders too) into every session; these are read on demand via the paths the rules cite.
link "$REPO_DIR/rules-references" "$CLAUDE_DIR/nextc-claude-references"

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
echo "  Global:"
echo "    /plugin install nextc-ecc@nextc-claude"
echo "    /plugin install nextc-core@nextc-claude"
echo "  Per project, as needed:"
echo "    /plugin install nextc-product@nextc-claude"
echo "    /plugin install nextc-project-kickoff@nextc-claude"
echo "    /plugin install nextc-flutter@nextc-claude"
echo "    /plugin install nextc-unity@nextc-claude"
echo "    /plugin install nextc-aso@nextc-claude"
echo "    /plugin install nextc-claude-toolbox@nextc-claude"
