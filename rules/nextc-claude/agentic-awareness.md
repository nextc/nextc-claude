# Skill Selection

## Rule

On every user prompt, evaluate the available skills list and determine which (if any) are relevant before generating a response.

## Process

1. **Scan** — Check the available skills against the user's request
2. **Select** — Pick skills that directly match the task
3. **Output** — Display a brief context block at the top of your response:
   ```
   **Skills:** skill-name, skill-name
   **Agents:** agent-name (model), agent-name (model)
   **Rules:** rule-name, rule-name
   ```
   Only show lines that apply. Keep it one line each, no verbose reasons.
4. **Invoke** — Call the Skill tool for each selected skill before generating other content

## Guidelines

- ALWAYS show the context block, even for simple questions or conversations. If no skills/agents are invoked, show `**Rules:**` with whichever rules informed the response.
- Do NOT delay responses with unnecessary evaluation — keep the block brief and move on
- When multiple skills apply, invoke them in logical order (e.g., planner before code-reviewer)
- If a skill is already running or was just invoked in the current turn, do not re-invoke it
