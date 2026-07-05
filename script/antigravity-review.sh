#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-origin/main}"
MODEL="${ANTIGRAVITY_MODEL:-}"
PRINT_TIMEOUT="${ANTIGRAVITY_PRINT_TIMEOUT:-5m}"
SKIP_PERMISSIONS="${ANTIGRAVITY_SKIP_PERMISSIONS:-0}"

if ! command -v agy >/dev/null 2>&1; then
  echo "Antigravity CLI 'agy' is not available; skipping review." >&2
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a Git repository; skipping review." >&2
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"

if ! git rev-parse --verify --quiet "$BASE_BRANCH" >/dev/null; then
  if [[ "$BASE_BRANCH" == "origin/main" ]] && git rev-parse --verify --quiet main >/dev/null; then
    BASE_BRANCH="main"
  fi
fi

BASE_AVAILABLE=0
if git rev-parse --verify --quiet "$BASE_BRANCH" >/dev/null; then
  if git merge-base "$BASE_BRANCH" HEAD >/dev/null 2>&1; then
    BASE_AVAILABLE=1
  else
    echo "No common ancestor between '$BASE_BRANCH' and HEAD; reviewing working tree changes only." >&2
  fi
else
  echo "Base branch '$BASE_BRANCH' is not available; reviewing working tree changes only." >&2
fi

if [[ "$BASE_AVAILABLE" -eq 1 ]] && git diff --quiet "$BASE_BRANCH"...HEAD && [[ -z "$(git status --porcelain)" ]]; then
  echo "No Git changes to review; skipping review." >&2
  exit 0
fi

if [[ "$BASE_AVAILABLE" -eq 0 ]] && [[ -z "$(git status --porcelain)" ]]; then
  echo "No Git changes to review; skipping review." >&2
  exit 0
fi

if [[ "$BASE_AVAILABLE" -eq 1 ]]; then
  REVIEW_SCOPE="$(cat <<SCOPE_EOF
- Review the current Git changes against the base branch: $BASE_BRANCH
- Include committed branch changes, staged changes, unstaged working tree changes, and untracked files.
SCOPE_EOF
)"
  INSPECT_COMMANDS="$(cat <<INSPECT_EOF
1. git status --short --untracked-files=all
2. git diff --stat "$BASE_BRANCH"...HEAD
3. git diff "$BASE_BRANCH"...HEAD
4. git diff --cached
5. git diff
6. git ls-files --others --exclude-standard
7. Relevant surrounding files, including untracked files listed by Git
8. Existing tests, type checks, linters, and build scripts by reading their files only
INSPECT_EOF
)"
else
  REVIEW_SCOPE="$(cat <<SCOPE_EOF
- Review staged changes, unstaged working tree changes, and untracked files.
- Do not ask Git to diff against $BASE_BRANCH because that ref is not available.
SCOPE_EOF
)"
  INSPECT_COMMANDS="$(cat <<INSPECT_EOF
1. git status --short --untracked-files=all
2. git diff --cached
3. git diff
4. git ls-files --others --exclude-standard
5. Relevant surrounding files, including untracked files listed by Git
6. Existing tests, type checks, linters, and build scripts by reading their files only
INSPECT_EOF
)"
fi

PROMPT="$(cat <<PROMPT_EOF
You are an independent senior code reviewer reviewing changes produced by Codex.

Important rules:
- Do not modify files.
- Do not stage, commit, format, or rewrite code.
- Do not fix issues directly.
- Do not run build, test, lint, format, generate, install, migration, or check commands.
- Use static inspection only.
- Read files and Git diffs with read-only commands such as git status, git diff, git show, rg, sed, find, and ls.
- Do not read local credentials or environment files unless they are part of the Git diff.
- Review only and report findings.
- Prefer concrete, actionable findings over generic advice.
- If something is uncertain, say what evidence is missing.

Review scope:
- Repository root: $REPO_ROOT
- Do not review files outside the repository root above.
$REVIEW_SCOPE
- Read relevant surrounding files before making claims.
- Infer the implementation goal from changed files, commit messages, issue references, and nearby tests.

Please inspect:
$INSPECT_COMMANDS

Evaluate:
- Correctness and regressions
- Edge cases and error handling
- Type safety
- API compatibility
- Security and privacy risks
- Performance issues
- Accessibility and UX issues, if UI is touched
- Test coverage
- Consistency with existing project conventions
- Whether the implementation appears to satisfy the goal

Output format:

## Verdict
One of:
- APPROVE
- COMMENT
- REQUEST_CHANGES

## Summary
Briefly summarize what changed and the main risk.

## Findings
For each finding, use this format:

### [severity] title
- Severity: blocker / high / medium / low / nit
- File: path/to/file
- Evidence: quote or describe the relevant code
- Problem: why this is an issue
- Suggested fix: concrete recommendation

Only include findings that are actionable.

## Missing tests
List specific tests that should be added or updated.

## Validation
List read-only commands you inspected.
Do not claim to have run build, test, lint, format, generate, install, migration, or check commands.

## Quota
Report any Antigravity quota, usage, or remaining values visible in this run.
If quota information is not available from the CLI output, write "not available from agy output".

## Non-blocking suggestions
Optional improvements that should not block merging.
PROMPT_EOF
)"

run_agy() {
  local args=(--new-project --add-dir "$REPO_ROOT" --print-timeout "$PRINT_TIMEOUT")

  if [[ "$SKIP_PERMISSIONS" == "1" ]]; then
    args+=(--dangerously-skip-permissions)
  fi

  if [[ -n "$MODEL" ]]; then
    args+=(--model "$MODEL")
  fi

  agy "${args[@]}" -p "$PROMPT"
}

if ! run_agy; then
  echo "Antigravity review failed; continuing without blocking the workflow." >&2
fi
