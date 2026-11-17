# Project Documentation

Keep each project's `docs/` folder the single source of truth for product state, updated at completion points and only with verified facts.

## When docs get updated

Run the `doc-keeper` agent (in the background) in one of three ways:

1. **Offer it once, at a completion point, as the last line of your report**, naming what is stale ("Docs now behind: tasks.md, the sync spec. Say 'sync docs' and I'll run doc-keeper."). It is an offer, not a blocking question: do not stop the task or use a question prompt for it, and do not repeat it if the user moves on. Spawn when the user says yes. Under a standing approval ("don't ask", "full auto") spawn it without offering and say that you did.
2. **The user asks**, for example with `/update-docs`; that request is the approval.
3. **An approved `/autopilot` plan**, which covers one run at the end.

Completion points are: a feature completely built and verified, a phase or milestone done, a bug fix confirmed, an architectural decision finalized. Do not suggest it after small edits or intermediate steps, because repeated offers are noise. If `doc-keeper` is unavailable when approved, update the docs inline under the same rules.

This does not stop you syncing a spec record your own change made stale (`latest-spec-wins.md`) or the changelog before a commit (`git-workflow.md`).

## Real data only

Docs record what exists, verified this session against the real source: the git diff and log, file contents, command output. Do not write invented or estimated numbers, dates, versions, counts, paths, API shapes or behavior; write `*(unverified — needs check)*` or leave it out. Do not document planned behavior as if it exists. `doc-keeper`'s definition holds the doc structure and update guidelines.
