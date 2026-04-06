# Project Documentation

Every project MUST maintain a `docs/` folder as the single source of truth for product state.

## Auto-Update

At the END of any response that changes code, completes tasks, fixes bugs, or makes architectural decisions:

1. Spawn the `doc-keeper` agent in the background
2. If `doc-keeper` is unavailable, update docs inline
3. NEVER block the user waiting for doc updates — always background

The doc-keeper agent definition contains the full documentation structure, file purposes, and update guidelines.
