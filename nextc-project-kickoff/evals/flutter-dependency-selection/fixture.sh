#!/usr/bin/env bash
# Seeds the empty workspace with a synthetic proposal (no real product data).
set -euo pipefail
mkdir -p docs
cat > docs/proposal.md <<'PROPOSAL_EOF'
# Moss: shared plant care for households

## Recommendation
Build. Households lose plants because nobody knows who watered what. A small app that tracks each plant's schedule and tells the right person at the right time is a clear, narrow v1.

## Elevator Pitch
Moss keeps every plant in a household on a care schedule and reminds the person who is home when a plant is due, so nobody waters twice or forgets.

## Target Users
- Roommates and couples who share 5 to 30 plants.
- Solo plant owners who want reminders without an account.

## What To Build First (MVP)
1. Add a plant: name, optional species text, optional photo from the camera or library, location in the home.
2. Watering schedule per plant: every N days, with the next due date shown on the plant.
3. Today list: plants due today or overdue, sorted by how overdue they are; mark one as watered with a single tap.
4. Care history: each watering is recorded with who did it and when; a plant shows its last five events.
5. Households: invite a second person with a link; both see the same plants and history.
6. Reminders: one local notification per day at a time the member chooses, listing plants due.

## What NOT To Build (v1)
- Plant identification from photos.
- A marketplace or any buying and selling.
- A social feed or public profiles.
- Fertilizing, repotting and light schedules (only watering in v1).

## Constraints
- Must work offline: marking a plant watered on a train must not fail.
- A solo user must be able to use everything except sharing without creating an account.
- Photos stay on the device unless the household is shared.

## Business Model
Free in v1. A paid tier is a later decision.

## Risks
Sync conflicts when two people water the same plant while offline; notification permission denied.

## Appendix: evidence
Interviews with eight roommates (summarized in docs/explore/interviews.md, not included).
PROPOSAL_EOF
