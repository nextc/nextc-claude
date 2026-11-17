#!/usr/bin/env bash
set -euo pipefail

# nextc-claude setup — symlinks rules into ~/.claude/rules/nextc-claude/ and their long-form
# references into ~/.claude/nextc-claude-references/, and merges settings/user-settings.json
# (permission allow/ask/deny rules + auto mode exceptions) into ~/.claude/settings.json.
# Agents and skills are installed via marketplace (/plugin marketplace add + /plugin install).
# Teammates do not need this script for the rules: the nextc-core plugin copies them into
# ~/.claude at session start (nextc-core/scripts/install-rules.mjs) and leaves a linked folder
# alone. Use this script when you work on this repo and want your edits live, or for the settings.

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
BACKUP_DIR="$CLAUDE_DIR/backups"
SHIPPED="$REPO_DIR/settings/user-settings.json"
SETTINGS="$CLAUDE_DIR/settings.json"
MARKETPLACE="$REPO_DIR/.claude-plugin/marketplace.json"
INSTALLED_PLUGINS="$CLAUDE_DIR/plugins/installed_plugins.json"

MODE=apply
SKIP_GIT_HOOKS=0
DRIFT=0

usage() {
  cat <<'USAGE'
Usage: setup-rules.sh [--check] [--skip-git-hooks] [--help]

  (no flags)         Symlink the rules and references into ~/.claude/ and merge
                     settings/user-settings.json into ~/.claude/settings.json.
                     Safe to re-run; it never removes or reorders your settings entries.
  --check            Change nothing. Report whether the symlinks point at this checkout,
                     this checkout's version against the installed nextc-claude plugins,
                     which shipped settings entries are missing from ~/.claude/settings.json,
                     and whether jq is available. Exits 1 when any drift is found.
  --skip-git-hooks   Do not set this checkout's git core.hooksPath to .githooks.
  --help, -h         Show this help.

Existing real files or directories at a link destination are moved to ~/.claude/backups/,
never into ~/.claude/rules/ (every .md there is loaded into every session).
Settings are backed up to ~/.claude/settings.json.bak.<timestamp> before any change.
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --skip-git-hooks) SKIP_GIT_HOOKS=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

drift() {
  DRIFT=$((DRIFT + 1))
  echo "✗ $*"
}

# jq definitions shared by apply and --check so both agree on what is "missing".
# EXTERNAL: an autoMode.allow list without "$defaults" replaces every built-in exception
# (code.claude.com/docs/en/auto-mode-config). The shipped list starts with it, but a user who
# already owns an autoMode.allow list keeps their choice: the token is only added to a new list.
# ASSUMPTION: the permission and autoMode lists in settings.json are arrays of strings.
JQ_DEFS='
  def miss($have; $want): ($have // []) as $h | [($want // [])[] | select(. as $x | ($h | any(. == $x)) | not)];
  def missing($ship):
    {
      "permissions.allow": miss(.permissions.allow; $ship.permissions.allow),
      "permissions.ask": miss(.permissions.ask; $ship.permissions.ask),
      "permissions.deny": miss(.permissions.deny; $ship.permissions.deny),
      "autoMode.allow": (
        if ((.autoMode.allow // []) | length) > 0
        then miss(.autoMode.allow; ($ship.autoMode.allow // []) | map(select(. != "$defaults")))
        else miss([]; $ship.autoMode.allow) end)
    };
  def append($path; $items): if ($items | length) > 0 then setpath($path; (getpath($path) // []) + $items) else . end;
'

settings_json() {
  if [ -f "$SETTINGS" ]; then cat "$SETTINGS"; else echo '{}'; fi
}

link() {
  local src="$1" dest="$2"
  if [ -L "$dest" ]; then
    local target
    target="$(readlink "$dest")"
    if [ "$target" = "$src" ]; then
      echo "✓ $dest is already a symlink → $target"
    else
      echo "⚠ $dest points at $target, not this checkout. Re-pointing it to $src."
      ln -sfn "$src" "$dest"
      echo "✓ Linked $dest → $src"
    fi
  elif [ -e "$dest" ]; then
    mkdir -p "$BACKUP_DIR"
    local backup="$BACKUP_DIR/$(basename "$dest").bak.$(date +%Y%m%d%H%M%S)"
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

check_link() {
  local src="$1" dest="$2"
  if [ -L "$dest" ]; then
    local target
    target="$(readlink "$dest")"
    if [ "$target" = "$src" ]; then
      echo "✓ $dest → $target"
    else
      drift "$dest points at $target, expected $src"
    fi
  elif [ -e "$dest" ]; then
    drift "$dest is a real file or directory, not a symlink to $src"
  else
    drift "$dest is missing (expected a symlink to $src)"
  fi
}

# Merges settings/user-settings.json into ~/.claude/settings.json: appends missing permissions.allow,
# permissions.ask, permissions.deny and autoMode.allow entries, never removes or reorders yours.
# Backs up the file before any change.
merge_settings() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "⚠ jq not found — skipped the settings merge. Add the entries in $SHIPPED to $SETTINGS by hand."
    return 0
  fi
  local existed=1
  [ -f "$SETTINGS" ] || { existed=0; mkdir -p "$CLAUDE_DIR"; echo '{}' > "$SETTINGS"; }
  local merged
  if ! merged="$(jq --slurpfile ship "$SHIPPED" "$JQ_DEFS"'
      . as $orig | ($orig | missing($ship[0])) as $m
      | append(["permissions","allow"]; $m["permissions.allow"])
      | append(["permissions","ask"]; $m["permissions.ask"])
      | append(["permissions","deny"]; $m["permissions.deny"])
      | append(["autoMode","allow"]; $m["autoMode.allow"])
    ' "$SETTINGS")"; then
    echo "✗ Could not parse $SETTINGS; left it unchanged."
    return 1
  fi
  if [ "$merged" = "$(jq . "$SETTINGS")" ]; then
    echo "✓ $SETTINGS already has every entry from settings/user-settings.json"
  else
    local backup="${SETTINGS}.bak.$(date +%Y%m%d%H%M%S)"
    if [ "$existed" -eq 1 ]; then cp "$SETTINGS" "$backup"; else backup="none, the file is new"; fi
    printf '%s\n' "$merged" > "$SETTINGS"
    echo "✓ Merged settings/user-settings.json into $SETTINGS (backup: $backup)"
  fi
}

check_versions() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "⚠ Plugin versions not compared (needs jq)."
    return 0
  fi
  local checkout market
  checkout="$(jq -r '.metadata.version // empty' "$MARKETPLACE" 2>/dev/null || true)"
  market="$(jq -r '.name // empty' "$MARKETPLACE" 2>/dev/null || true)"
  if [ -z "$checkout" ]; then
    echo "⚠ Could not read the checkout version from $MARKETPLACE."
    return 0
  fi
  echo "  checkout version: $checkout"
  if [ ! -f "$INSTALLED_PLUGINS" ]; then
    echo "  no $INSTALLED_PLUGINS — plugin versions not compared"
    return 0
  fi
  # ASSUMPTION: installed_plugins.json maps "<plugin>@<marketplace>" to a list of installs that each carry a "version"; other shapes are skipped.
  local rows
  rows="$(jq -r --arg m "@$market" '
      try ((.plugins // .) | to_entries[]
        | select(.key | endswith($m))
        | .key as $k | (.value | if type == "array" then .[] else . end)
        | select(type == "object" and has("version")) | "\($k)\t\(.version)")
      catch empty' "$INSTALLED_PLUGINS" 2>/dev/null | sort -u || true)"
  if [ -z "$rows" ]; then
    echo "  no $market plugins recorded in installed_plugins.json — plugin versions not compared"
    return 0
  fi
  local key version
  while IFS=$'\t' read -r key version; do
    if [ "$version" = "$checkout" ]; then
      echo "✓ $key installed $version"
    else
      drift "$key installed $version, checkout is $checkout (run /plugin update, or pull this checkout)"
    fi
  done <<< "$rows"
}

check_settings() {
  if ! command -v jq >/dev/null 2>&1; then
    drift "jq not found — cannot verify $SETTINGS; install jq (brew install jq) and re-run"
    return 0
  fi
  local rows
  if ! rows="$(settings_json | jq -r --slurpfile ship "$SHIPPED" "$JQ_DEFS"'
      missing($ship[0]) | to_entries[] | .key as $k | .value[] | "\($k)\t\(.)"' 2>&1)"; then
    drift "could not parse $SETTINGS: $rows"
    return 0
  fi
  if [ -z "$rows" ]; then
    echo "✓ $SETTINGS has every entry from settings/user-settings.json"
    return 0
  fi
  local key entry
  while IFS=$'\t' read -r key entry; do
    drift "$SETTINGS is missing $key entry: ${entry:0:120}"
  done <<< "$rows"
}

run_check() {
  echo "Checking nextc-claude setup (nothing will be changed)"
  check_link "$REPO_DIR/nextc-core/rules/nextc-claude" "$CLAUDE_DIR/rules/nextc-claude"
  check_link "$REPO_DIR/nextc-core/rules-references" "$CLAUDE_DIR/nextc-claude-references"
  if command -v jq >/dev/null 2>&1; then echo "✓ jq available"; else echo "⚠ jq not available"; fi
  check_versions
  check_settings
  echo ""
  if [ "$DRIFT" -eq 0 ]; then
    echo "No drift found."
    return 0
  fi
  echo "$DRIFT drift item(s) found. Run ./setup-rules.sh to fix the links and settings."
  return 1
}

if [ "$MODE" = check ]; then
  run_check
  exit $?
fi

link "$REPO_DIR/nextc-core/rules/nextc-claude" "$CLAUDE_DIR/rules/nextc-claude"
# EXTERNAL: kept outside ~/.claude/rules/ on purpose — Claude Code loads every .md under rules/
# (subfolders too) into every session; these are read on demand via the paths the rules cite.
link "$REPO_DIR/nextc-core/rules-references" "$CLAUDE_DIR/nextc-claude-references"

merge_settings

# Configure repo-local git hooks (pre-commit runs validate.js and the script tests)
if [ "$SKIP_GIT_HOOKS" -eq 0 ] && [ -d "$REPO_DIR/.git" ] && [ -d "$REPO_DIR/.githooks" ]; then
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
echo ""
echo "Verify any time with: ./setup-rules.sh --check"
