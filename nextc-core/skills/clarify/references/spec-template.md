# Spec template

```markdown
# {Title}

## Metadata
- Interview Rounds: {count}
- Final Ambiguity: {score}%
- Type: greenfield | brownfield
- Generated: {date}
- Status: {PASSED | EARLY_EXIT}

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | {s} | {w} | {s*w} |
| Constraint Clarity | {s} | {w} | {s*w} |
| Success Criteria | {s} | {w} | {s*w} |
| Context Clarity | {s} | {w} | {s*w} |

## Goal
{crystal-clear goal statement}

## Constraints
- {constraint 1}
- {constraint 2}

## Non-Goals
- {explicitly excluded scope 1}
- {explicitly excluded scope 2}

## Acceptance Criteria
- [ ] {testable criterion 1}
- [ ] {testable criterion 2}
- [ ] {testable criterion 3}

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| {assumption} | {how questioned} | {what decided} |

## Technical Context
{brownfield: relevant codebase findings}
{greenfield: technology choices and constraints}

## Data Model (if applicable)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| {name} | {type} | {fields} | {relationships} |

## Interview Transcript
<details>
<summary>Full Q&A ({n} rounds)</summary>

### Round 1
**Q:** {question}
**A:** {answer}
**Ambiguity:** {score}%

...
</details>
```
