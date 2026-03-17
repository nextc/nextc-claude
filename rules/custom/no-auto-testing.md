# No Automatic Testing

Do not write tests, run tests, or invoke testing-related agents/skills unless the user explicitly asks for them.

This includes:
- Do not generate test files
- Do not run test suites
- Do not invoke tdd-guide, e2e-runner, or any testing agents/skills automatically
- Skip testing steps in the development workflow

Only write or run tests when the user specifically requests it.
