#!/usr/bin/env bash
# Seeds the empty workspace with a synthetic proposal (no real product data).
set -euo pipefail
mkdir -p docs
cat > docs/proposal.md <<'PROPOSAL_EOF'
# Tidepool: a one-thumb tide puzzle game

## Recommendation
Build. A short-session mobile puzzle game with a clear hook: you reshape a shoreline so rising water fills the right pools in order.

## Elevator Pitch
Tidepool is a 2D puzzle game for phones where you place barriers on a beach before the tide comes in, and watch the water flow fill the pools you planned for.

## Target Users
- Commuters who play 3 to 5 minute sessions one-handed.
- Puzzle fans who like physics-light, deterministic puzzles.

## What To Build First (MVP)
1. Level play: a grid beach, a tide that rises in 3 steps, and a set of barriers the player places before the tide runs.
2. Tide simulation: deterministic water flow across the grid, same result every run for the same placement.
3. Barrier placement: drag barriers from a tray onto grid cells, with undo and reset.
4. Level set: 20 handcrafted levels defined as data, unlocked in order.
5. Progress: stars per level (1 to 3, by barriers used) saved on the device.
6. Settings: sound on/off and a colorblind-safe water palette toggle.

## What NOT To Build (v1)
- Multiplayer or leaderboards.
- A level editor.
- Ads and in-app purchases.
- Console or desktop builds.

## Constraints
- Phones only (Android and iOS), portrait, one-handed.
- Must hold 60 frames per second on a mid-range phone from three years ago.
- Fully offline; no account.

## Business Model
Premium paid app later; none in v1.

## Risks
Level design effort; simulation determinism across devices.
PROPOSAL_EOF
