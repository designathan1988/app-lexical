# AGENTS.md

## Rule zero — research first

**Rule zero — research on the internet first, always.** Before implementing anything that is not trivial, search the official documentation. Open and read the relevant pages, understand the documented behavior and the relevant project code, and only then design and implement the change. Do not rely on search snippets, memory, or a passing metric as a substitute for understanding. Record the sources and the decisions they support when the task calls for a report.

## Priority

When instructions conflict, apply them in this order:

1. Explicit user restrictions and the restrictions in this file.
2. The literal instruction for the current task.
3. Implicit goals or your opinion about the best solution.

A restriction is not negotiable to reach a goal. If a goal can only be reached by violating a restriction, stop and explain the conflict. Do not work around it.

## Prohibited implementation methods

- Do not integrate, call, or depend on an LLM or another AI model to implement project functionality or produce application results.
- Do not use conditional branches, regular expressions, or pattern matching keyed to specific words, sentences, lemma ids, or test cases (e.g. `if (word === 'foi')`, a regex over a test sentence) to meet project objectives or target metrics. Generic control flow over linguistic categories (part of speech, morphological features, dependency relations, semantic types, frame properties) is allowed. Declarative linguistic rules stored as data (Constraint Grammar SELECT/REMOVE rules, inflection paradigms including full-form paradigms for irregular words, verb frames, preposition roles) are allowed and preferred, provided each rule has an id, a cited source or linguistic justification, and an example, and applies to a class of cases rather than to one sentence.
- Do not use `eval`, `new Function`, randomized search, external answer corpora, or runtime network services as shortcuts to meet project objectives.
- Do not disguise a word-specific or test-specific special case in a helper, script, configuration file, generated code, dependency, renamed operation, or sequence of smaller steps. A method remains prohibited even if it seems to be the only way forward.
- Do not hard-code expected outputs, sentence-specific answers, or lookup pairs to make evaluations pass. Implement general behavior supported by the project's documented rules and data.
- These restrictions apply to new work. They do not authorize deleting or rewriting existing code outside the requested task.

## Non-negotiable restrictions

- Do exactly what was requested. Do not expand scope, refactor unrelated code, replace libraries, or change public interfaces without a request.
- Never make a check pass by bypassing it: do not edit, delete, or skip tests; hard-code expected output; mock the behavior being tested; silence errors with empty `try/catch`, `|| true`, `--no-verify`, `@ts-ignore`, `# noqa`, or `eslint-disable`; or loosen lint or CI thresholds. The only exception is an explicit user request.
- Never claim that something works, compiles, or passes unless you ran the relevant command and saw its output in the current session.
- Ask before deleting files or data, adding dependencies, changing migrations or schemas, or running destructive Git commands such as `reset --hard`, `push --force`, `clean -fd`, or rebasing a shared branch.

## Working method

- Read only what the task needs. Do not map the entire repository before a small change.
- Act as soon as you have enough context. Prefer making and verifying the change over continuing to investigate without a concrete need.
- For small uncertainties, choose a reasonable default, proceed, and record the assumption in the final response. Ask only when the answer would change the outcome and a wrong choice would be expensive to reverse.
- Run the smallest relevant test first. Run the full suite when requested or when the change is broad.

## When blocked

- If the same approach fails twice, change the hypothesis or stop instead of trying a third variation.
- After three attempts without concrete progress, stop and report what you tried, the exact error, your best hypothesis, and what you need from the user.
- Do not reopen a decision without new evidence.
- Reporting a genuine blocker is acceptable. A false result or a result obtained through a prohibited method is not.

## Definition of done

1. The requested change is complete.
2. The relevant verification was run and passed.
3. Nothing outside the requested scope was changed.

Do not stop early to request review unless you are blocked or need one of the approvals above.

## Final response

Keep it short and factual:

- State what changed and name the files.
- State the verification command and its actual result. If verification did not run, write **NOT VERIFIED** and explain why.
- State assumptions, deviations, and unfinished work explicitly.

## Project commands

- Install: `npm ci`.
- Test one file: `npx vitest run <file>`.
- Test everything: `npm test`.
- Build and type-check: `npm run build` and `npx tsc --noEmit`.
- Lint/format: no command is configured in `package.json`.
- Prohibited in this project: the methods listed under **Prohibited implementation methods** and **Non-negotiable restrictions**.
