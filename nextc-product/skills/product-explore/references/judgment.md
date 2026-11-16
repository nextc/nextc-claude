# Judgment records

Evidence says what is true. Judgment says what to do about it. Keep them apart: judgment is
prose written by the main session in `docs/explore/judgment.md`, and each record says what it
rests on, so a reader (and the critic) can check it.

## Format

```markdown
## J3 Recommendation: VALIDATE FIRST
rests_on: [c_1a2b3c4d5e, c_9f8e7d6c5b]
assumes: [A1, "the web build still runs"]

Two to six sentences of reasoning. Cite claim ids inline where a sentence states a fact.
```

`rests_on` lists claim ids from the records. `assumes` lists intake assumption ids, or a short
quoted assumption that is new (add it to `intake.json` as the next `A` id if the memo will rely on it).

## The records to write

Write these, in order. Skip one only when the intake makes it irrelevant, and say so in one line.

1. **J1 Options.** For each intake option, what the evidence says for and against it. This is
   where a prior-art finding that makes an option pointless gets said plainly.
2. **J2 The mechanism.** The one thing the product rests on (a technical effect, a behaviour, a
   data source, a channel), whether the evidence shows it works, and what nobody has measured.
3. **J3 Recommendation.** One label (BUILD, VALIDATE FIRST, PIVOT, DO NOT BUILD), the chosen
   option, and the strongest rejected alternative with the reason it lost. Not a straw man.
4. **J4 Scope if built.** At most five things to build first and the things deliberately left
   out, each tied to evidence or marked as judgment. Skip for DO NOT BUILD.
5. **J5 Experiments.** One to three experiments, cheapest first. Each has:
   - what it tests (an assumption or kill-condition id),
   - the action, its cost and how long it takes,
   - a **threshold** ("at least 8 of 15 pairs"),
   - a **denominator**: the expected sample or traffic and where it comes from. Prefer the
     founder's own assets ("15 photos from the 3 artists in F1"). A denominator the founder
     cannot reach is a defect.
   - what we do if it passes and if it fails.
6. **J6 Kill criteria.** Every founder kill condition, mapped to the experiment that tests it,
   with a numeric threshold. Add at most two more if the evidence shows a kill risk the founder missed.
7. **J7 Name and positioning.** Only if `name_status` is `open` or `working`, or positioning is
   part of the decision. Name candidates are judgment; a collision with an existing product is
   evidence and must cite the prior-art record. Suggest `/aso-naming --from-proposal` for a full pass.

## Rules

- Weight by evidence, not by count. One primary-source record beats five forum posts.
- A judgment that rests on an unverified, weakened or refuted record says so in its prose.
- Numbers you choose (thresholds, sample sizes) are judgment: mark them `[assumption]` in the memo.
- After writing, run `node <script> memo-check --dir docs/explore --memo docs/explore/judgment.md --words 0 --labels none --numbers off --sample docs/explore/judgment-citations.md`
  to catch ids that do not exist or were refuted. Fix before spawning the critic.
