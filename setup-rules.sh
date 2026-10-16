#!/usr/bin/env bash
set -euo pipefail

# nextc-claude setup — symlinks rules into ~/.claude/rules/nextc-claude/ and their long-form
# references into ~/.claude/nextc-claude-references/, and merges settings/user-settings.json
# (build permission rules + auto mode exceptions) into ~/.claude/settings.json.
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

# Merges settings/user-settings.json into ~/.claude/settings.json: appends missing permissions.allow
# and autoMode.allow entries, never removes or reorders yours. Backs up the file before any change.
merge_settings() {
  local src="$REPO_DIR/settings/user-settings.json" dest="$CLAUDE_DIR/settings.json"
  if ! command -v jq >/dev/null 2>&1; then
    echo "⚠ jq not found — skipped the settings merge. Add the entries in $src to $dest by hand."
    return 0
  fi
  [ -f "$dest" ] || echo '{}' > "$dest"
  local merged
  # EXTERNAL: an autoMode.allow list without "$defaults" replaces every built-in exception
  # (code.claude.com/docs/en/auto-mode-config), so a new list starts with it.
  if ! merged="$(jq --slurpfile add "$src" '
      def union($a; $b): ($a // []) + [($b // [])[] | select(. as $x | ($a // []) | any(. == $x) | not)];
      .permissions.allow = union(.permissions.allow; $add[0].permissions.allow)
      | if ($add[0].autoMode.allow // []) == [] then .
        else .autoMode.allow = union(.autoMode.allow // ["$defaults"]; $add[0].autoMode.allow) end
    ' "$dest")"; then
    echo "✗ Could not parse $dest; left it unchanged."
    return 1
  fi
  if [ "$merged" = "$(jq . "$dest")" ]; then
    echo "✓ $dest already has every entry from settings/user-settings.json"
  else
    local backup="${dest}.bak.$(date +%Y%m%d%H%M%S)"
    cp "$dest" "$backup"
    printf '%s\n' "$merged" > "$dest"
    echo "✓ Merged settings/user-settings.json into $dest (backup: $backup)"
  fi
}
merge_settings

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
