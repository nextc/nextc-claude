# Engineering Bar: the checklist

> Owner: `rules/nextc-claude/engineering-bar.md`. Read when planning a feature, designing a schema, a query or a screen, or reviewing whether a change is ready.

The rule states the bar as five decisions. This file is the working checklist behind them, in ten sections; the problem (section 1) comes before the five and frames them. It is stack-neutral. For what a specific database, SDK or service does (which index serves a query, limits, transaction semantics, what is billed), read that product's official docs at the time of the decision and cite them (`verify-before-claim.md`). Do not design from memory of a product's behavior.

Sections 2 and 4 to 9 draw on the sources listed at the end, read on 2026-11-24. Numbers quoted from them are marked with the page they came from; thresholds change, so re-check a number before a decision rests on it.

## Why this rule exists

Feedback on plans produced by this toolkit (2026-11-24): the plans sequenced files and steps well and decided nothing about the solution. New features were planned with no data model reasoning, no indexes and no thought for size, so the code ran on a developer's ten rows and would not hold on real data. The planner's format asked for files, dependencies and verify commands, and never asked for a design; nothing downstream asked either. A first fix covered data access only; the follow-up feedback was that performance is more than indexes, which is why this checklist covers targets, critical-path cost, limits, overload, the client and proof.

## What is decided now, and what waits

Decide at design time what is expensive to change once data and clients exist:

- the performance target for each critical flow;
- the store, the data model and the key that spreads or concentrates writes;
- the API shape and the payload it carries;
- what is synchronous and what runs in the background;
- the workload the design is sized for.

Leave to measurement what is cheap to change later: tuning a query that works, a faster algorithm for a loop nobody has profiled, a cache for a path nobody has timed. Do not tune for speed before measuring, and choose data structures early because they decide the algorithms (both from Rob Pike's rules of programming). An exact capacity figure is confirmed by a prototype or a load test, not settled on paper.

## 1. Problem

- What problem is behind the request? Would the mechanism the request names solve it? Is there a simpler one?
- What already exists in the codebase that does part of this?
- What is explicitly not being solved?

## 2. Targets and workload

- Name the critical flows. Not every path is hot; the ones users feel and the ones the business depends on get targets first.
- Give each a number: a latency percentile rather than an average (an average hides the slow tail), a throughput, a frame budget, a startup time. "Fast" and "responsive" are not targets.
- Do not set the target from what the system happens to do today; set it from what the user needs, start loose and tighten.
- Split an end-to-end target into a budget per layer (for example: the API call, the database query inside it).
- Size the workload: rows or items per user and in total, peak request rate, growth. A back-of-envelope estimate at design time is expected; plan for the estimate and for ten times it.
- Where no number exists, write a modest assumption down so the reader can overrule it. An assumption that would change the design if it were smaller goes to the user.

## 3. Store and data model

Work from access patterns to schema, never the other way round.

1. List every read and write: who asks, the filter, the sort, the limit, how often.
2. Check the store fits the dominant pattern (relational, document, key-value, search, analytics, a local database on the device) before shaping data in it. Analytics on the transactional store is a design decision, not a default.
3. Shape tables or collections to serve the patterns. Choose keys and types deliberately; a wrong key type or a missing timestamp is expensive to change once data exists.
4. Check how the key distributes writes. In some stores a monotonically increasing key, or many writes to neighbouring keys, concentrates load on one partition; read the store's own guidance.
5. Let the store enforce what it can: uniqueness, foreign keys, not-null, checks. A rule only the application enforces is broken by the first second writer.
6. Give every filter, join and sort on a hot path an index, written out with its columns in order, next to the query it serves. An index nobody queries costs every write; drop it.
7. Denormalize or precompute only for a named read, and state what keeps the copy correct.
8. State what is not stored.

## 4. Critical-path cost

- Count round trips, to the store and over the network. A query or call inside a loop is one round trip per item; join or batch instead.
- Compare rows read with rows returned. Filtering, joining, sorting or counting in application code reads everything to return a little.
- Bound every read. A list that can grow has a limit and a pagination scheme; offset pagination reads and discards every skipped row, so a long list pages by key or cursor.
- Fetch the fields used, not the whole row or document, on a hot path. Cap the response size.
- Write in batches or with the store's bulk path, not one statement and one commit per row.
- Move work that need not finish before the response off the request path (a background job or a queue), and bound the queue.
- Keep memory and time bounded as data grows: no whole result set or file held in memory, no quadratic pass over a growing collection.
- A count or aggregate shown often is not recomputed on every request once the table is large.
- Compress only after measuring that the bytes saved are worth the CPU.

## 5. Resources, limits and cost

- Connections: pool size per instance times the number of instances stays under the store's connection limit. One connection per request is a defect.
- Third-party quotas and rate limits: which ones the design will reach, and at what usage.
- Money: where a store bills per read or per operation, the number of reads per screen or per request is a cost decision. Put a ceiling on anything that scales automatically.
- A cache names what is cached, where (in process, shared, at the edge), for how long, the eviction policy, and the event that invalidates it. The system must still work when the cache is cold or gone; a cache the service cannot run without is a hidden dependency.
- Scaling: keep the service stateless where possible so it can scale out; a read replica helps reads at the price of weaker consistency, and that trade is stated. More hardware does not fix a slow path; fix the path.
- Routine operations (backups, reindexing, deploys, batch jobs) are scheduled away from peak.

## 6. Concurrency, failure and overload

- Is each write safe to retry and safe to receive twice? Name what makes it so (idempotency key, upsert, unique constraint).
- Two writers at once: who wins, and is that decided by the store or by luck? Locks keep data consistent and cost throughput; say which you chose.
- A multi-step write: one transaction, or a stated recovery when it stops between steps.
- Every call that leaves the process has a deadline and a decided behavior when it is missed.
- Retries are capped and use randomized exponential backoff; unlimited immediate retries turn one slow dependency into an outage.
- Decide what happens when demand exceeds capacity: keep queues short, reject early, and shed the least important requests first. A deep queue adds latency and memory without adding capacity.
- What the user sees in each failure.

## 7. On a client: app, game, web page

The questions are the same; the units differ.

- **Frame budget.** What runs per frame or per rebuild, against the budget for the target refresh rate. Flutter's docs give 16 ms to build and 16 ms to render at 60 Hz; Android's give under 16 ms per frame for 60 fps and say no frame should take longer than 700 ms.
- **Off the UI thread.** Parsing large payloads, file and database work and heavy computation run on a background thread or isolate.
- **Startup.** What the first frame waits for and what is initialized lazily. Design for a cold start.
- **Lists.** Long lists are built lazily, only the visible part.
- **Images and assets.** Decode at about the size shown; a bitmap much larger than its area on screen wastes memory.
- **Allocation in hot code** (games especially). Per-frame code allocates nothing it can avoid; objects created and destroyed often are pooled, because garbage collection pauses show up as dropped frames.
- **Draw calls** (games). Which meshes are static and share materials, so they batch.
- **Network.** Round trips per screen, payload size, what loads on demand, and what the app does on a slow or absent connection.
- **Web.** Core Web Vitals at the 75th percentile of real users: LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1 (web.dev). A JavaScript and asset budget, with code loaded on demand instead of one large bundle.
- **Size, battery, background.** Measure app size on a release build, not a debug one. Deferrable background work goes to the system scheduler with constraints, not a held wake lock.

## 8. Migration and lifecycle

- What happens to rows that already exist?
- How long does the backfill or index build lock or rewrite the table at its real size?
- Order changes so every deployed state works: add, backfill, switch, remove.
- A client on the old version keeps working, or the plan says how it is cut off.
- The rollback, and whether it loses data.
- How long the data is kept, and what archives or deletes it. Less data in the hot table is faster; partitioning added as an afterthought is hard.

## 9. Proof

A target without a way to check it is a wish. Name the check when you set the target.

- A query plan, read on data of realistic size. A plan from a toy table does not predict production, and the estimated row counts should be close to the real ones.
- A load test in a production-like environment, with a pass or fail threshold on a percentile, and a recorded baseline to compare later runs with.
- On a client: a profile on a real device, a slow one, in a release-like build. Debug builds and emulators mislead.
- A metric and an alert for the target once it is live, so drift is seen.
- Where the project has a pipeline, the check runs in it (a performance test, a bundle-size budget), so a regression fails a build instead of reaching users.
- Find the bottleneck by measuring, not by changing things at random or looking only where the tools already point.

Builds, device runs, load tests and anything against a live service need the user's approval (`heavy-commands.md`); the plan names them and marks them so.

## 10. Trade-offs

- The main alternative and the reason it lost, in a sentence.
- The first thing that breaks as this grows, at roughly what size, and the signal to watch.
- What was deliberately not built (a cache, a queue, partitioning, an abstraction) and what would justify it.

Over-building fails the bar the same way under-building does: a layer, a service or a generalization with no named need is cost with no return. A workload you assumed yourself does not count as a named need.

## Signs of code below the bar

Any of these in work presented as done is a finding in review:

- It works on the test data and nobody stated the size or the target it was built for.
- "It's fast" with no number and no measurement.
- A new filter or sort with no index, or a schema nobody compared with the queries.
- A query, fetch or await inside a loop over a collection that grows.
- A list endpoint or screen with no limit; a long list built eagerly.
- A call to another service with no timeout, or retried without a cap.
- Heavy work in a request handler, a `build` method or a per-frame update.
- A whole result set or file loaded into memory to use part of it.
- A patch at the point of failure that leaves the cause in place.
- A second way of doing something the codebase already does one way.
- Business logic in the layer that happened to be open: a query in a widget, a rule in a handler.
- A rule enforced by an `if` that the store could enforce with a constraint.
- Copy-pasted code with one line changed.
- An error path that was never thought about: empty, huge, slow, failed.
- Dead code, commented-out code or placeholder TODOs.

## Depth by size of change

| Change | Design owed |
|---|---|
| One-line fix, rename, copy change | A thought; nothing written |
| New query or screen on existing tables | The query, what serves it, its limit and pagination, what runs on the UI thread, in a few lines |
| New table, collection, index or migration; new store, cache or queue; a new critical flow | All five decisions in the plan file, worked through with every section here that applies, and reviewed before code |

A plan's length follows the same table. On 2026-11-24 the first broadened planner wrote a 31 KB plan, with a new test suite and a new dependency, for a change that moved one header check into a middleware: thorough about everything and proportionate about nothing. Covering every section is not the bar; deciding what matters for this change is.

## Sources

Read on 2026-11-24 through a fetch tool, so wording here is paraphrased; open the page before quoting it.

- Azure Well-Architected Framework, Performance Efficiency: design review checklist, performance targets, capacity planning, optimize data performance, optimize code and infrastructure, scaling and partitioning, performance testing. `learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/`
- AWS Well-Architected Framework, Performance Efficiency pillar. `docs.aws.amazon.com/wellarchitected/latest/performance-efficiency-pillar/`
- Google SRE book: Service Level Objectives, Handling Overload, Addressing Cascading Failures, Launch Coordination Checklist. `sre.google/sre-book/`. SRE workbook: Implementing SLOs. `sre.google/workbook/implementing-slos/`
- PostgreSQL docs: Using EXPLAIN, Populating a Database, Connection settings. `postgresql.org/docs/current/`
- Firestore best practices (cursors over offsets, hot spots, billed reads). `docs.cloud.google.com/firestore/docs/best-practices`
- Redis docs: key eviction. `redis.io/docs/latest/develop/reference/eviction/`
- Flutter docs: Performance best practices, Concurrency and isolates, Work with long lists, Measuring your app's size, Flutter performance profiling. `docs.flutter.dev/perf/`
- Android developers: Slow rendering, App startup time, Background optimization. `developer.android.com/topic/performance/`
- web.dev: Web Vitals, Interaction to Next Paint, Performance budgets 101, Code splitting. `web.dev/articles/`
- Unity Manual: Optimizing your code for managed memory, Draw call batching. `docs.unity.com`
- Rob Pike's rules of programming (read from a university mirror, not his own copy). Brendan Gregg, performance methodology and the USE method. `brendangregg.com/methodology.html`
- Martin Fowler, "Architecture" (the decisions you wish you could get right early). `martinfowler.com/architecture/`

Not sourced in this pass, so stated here as general practice or left out: Apple's hang and launch thresholds, Unity frame-rate and memory budgets, cache stampede protection, database connection poolers, lock contention in a specific database, and mobile offline and request-batching guidance.
