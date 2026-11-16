---
type: llm
focus: last_message
---

This is the final report of an idea exploration, written to the user.

PASS only if all of these hold:
1. It gives exactly one recommendation: BUILD, VALIDATE FIRST, PIVOT or DO NOT BUILD.
2. It names the strongest alternative and why it lost.
3. It gives a first next action with a numeric threshold AND a denominator (how many people, items or events, and where they come from).
4. It gives the path of the memo it wrote.

FAIL if any of these is missing, if it hedges between recommendations, or if the next action has no numbers.
