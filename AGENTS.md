# AGENTS.md

## General

Work efficiently. Minimize tool calls, context usage, command output, and unnecessary validation.

* Inspect only files reasonably relevant to the task.
* Do not scan the entire repository when the relevant area is known.
* Do not repeatedly read unchanged files.
* Prefer targeted searches over broad exploration.
* Make the smallest correct change.
* Preserve existing architecture, conventions, and coding style.
* Do not refactor, rename, move, or modify unrelated code.
* Prefer existing dependencies and project patterns.
* Batch related edits when possible.

## Validation

Use the minimum validation necessary to catch likely errors.

Do not optimize for maximum confidence or perform extra validation simply because tools are available.

### Level A — Default

Allowed automatically:

* inspect changed code and diff;
* syntax/config validation;
* lint changed or affected files;
* targeted type checks;
* directly related unit tests;
* `git diff --check` or equivalent lightweight checks.

For normal tasks, stop after appropriate Level A validation passes.

### Level B — Only when justified

Use only when targeted validation is insufficient or the change has broader impact:

* full TypeScript check;
* full lint;
* multiple related tests;
* component/API/integration tests for the affected feature;
* development server;
* minimal runtime smoke test.

Do not automatically escalate from Level A to Level B.

### Level C — Explicit request only

Do NOT automatically run:

* complete test suite;
* production build;
* full integration suite;
* browser automation;
* Playwright or Cypress;
* E2E tests;
* visual verification or screenshots;
* responsive multi-viewport checks;
* Lighthouse or performance profiling;
* broad accessibility/security/dependency audits.

Run Level C only when explicitly requested by the user or when the task fundamentally cannot be completed without it.

## Tests

Never automatically run the entire test suite.

If testing is useful, run only tests directly related to changed code.

Do not escalate from targeted tests to all tests merely for extra confidence.

If a targeted check fails, fix the relevant issue and rerun only that check.

Do not fix unrelated pre-existing failures.

## Browser / Server

Do not start a development server or use browser verification when code, types, lint, or targeted tests provide reasonable validation.

If runtime verification is necessary:

* reuse an existing server;
* test only the affected workflow;
* perform one meaningful check;
* stop when it passes.

Do not use visual verification merely to confirm that a UI change "looks correct."

## Builds

Do not automatically run production builds.

Run a build only when build/configuration/deployment behavior is relevant or explicitly requested.

## Debugging

When debugging:

1. Locate the smallest likely source.
2. Form a hypothesis.
3. Test it with the cheapest useful check.
4. Apply the smallest fix.
5. Validate only the affected behavior.

Avoid broad exploratory commands and unrelated changes.

## Context Efficiency

* Avoid large command outputs.
* Avoid loading large or generated files unless necessary.
* Do not inspect dependency directories or lockfiles unless relevant.
* Reuse information already established in the task.
* Stop exploring once enough information exists to implement safely.

## Safety

Never perform destructive operations unless explicitly requested.

Do not delete user data, reset databases, discard uncommitted work, rewrite Git history, or expose secrets, credentials, tokens, or environment values.

## Completion

Keep the final response concise. Report:

* what changed;
* important implementation decisions, if any;
* validation actually performed;
* anything requiring attention.

Never claim validation that was not performed.

## Default Workflow

1. Understand the request.
2. Locate the relevant code.
3. Inspect existing local patterns.
4. Make the smallest correct change.
5. Inspect the diff.
6. Run Level A validation if useful.
7. Stop.

Do not automatically continue to full lint, full TypeScript, all tests, build, dev server, browser, or visual verification.

## Core Rule

Before running another command or validation, ask:

> Is this necessary to find a likely error related to my change?

If not, do not run it.

When two checks provide similar confidence, always choose the cheaper and more targeted one.
