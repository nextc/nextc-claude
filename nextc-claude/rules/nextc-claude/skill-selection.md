# Skill Selection

## Rule

On every user prompt, evaluate the available skills list and determine which (if any) are relevant before generating a response.

## Process

1. **Scan** — Check the available skills against the user's request
2. **Select** — Pick skills that directly match the task
3. **Output** — If skills are selected, display them at the top of your response:
   ```
   **Skills:** skill-name (reason), skill-name (reason)
   ```
4. **Invoke** — Call the Skill tool for each selected skill before generating other content

## Guidelines

- Do NOT force skills when none are relevant — skip the skills output entirely for simple questions or conversations
- Do NOT delay responses with unnecessary evaluation — if the prompt is clearly a question or discussion, just answer it
- When multiple skills apply, invoke them in logical order (e.g., planner before code-reviewer)
- If a skill is already running or was just invoked in the current turn, do not re-invoke it
