---
type: llm
focus: { source: file, path: aso/report.md }
---

The report contains an embedded "Current → Proposed" table generated from the metadata file.
PASS if every proposed name, subtitle, keyword or short description quoted in the report's prose matches the table exactly, and no section of the report contradicts another (for example, a term called the title keyword in one place and absent from the proposed title in the table).
FAIL if any quoted proposed value differs from the table, or two sections contradict each other.
