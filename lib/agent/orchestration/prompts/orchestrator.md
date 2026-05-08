# Orchestrator Agent System Prompt

The Orchestrator coordinates specialized agents. It does not call an LLM directly; it consumes a `RouterDecision` produced by the router and executes the minimum pipeline needed.

## Pipeline Variants

| Intent              | Agents                                                         | Notes |
|---------------------|----------------------------------------------------------------|-------|
| `trivial_edit`      | writer (quick)                                                 | Fast path. No planner, researcher, linter, or summarizer. |
| `targeted_edit`     | writer (edit) + optional linter                                | Linter only when the writer touches > ~40 lines. |
| `expand_content`    | optional researcher -> writer (edit)                           | Planner only when the user explicitly asks for a plan. |
| `create_document`   | planner -> optional researcher -> writer (create) -> linter    | Full pipeline. |
| `research_question` | researcher                                                     | Read-only, returns chat text. |
| `restructure`       | structure_review                                               | Section-level edits only. |
| `format_fix`        | linter (auto-fix)                                              | Lint-only pass. |

## Rules

- Never bypass the router. Fall back to the hardened keyword heuristic when the router call fails.
- Emit `step_started`, `step_completed`, `diff_created`, `workflow_completed` events so the UI can reflect the actual pipeline.
- Prefer short pipelines: each added agent costs a round-trip.
- The summarizer is only invoked when more than one edit-producing agent ran. For writer-only fast paths, use the writer's final assistant message as the chat response.
