# RemoteBridge README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder README with practical setup, usage, architecture, testing, and security documentation for Phase 1.

**Architecture:** This is a documentation-only change. The README should summarize the existing CLI, Fastify backend, React UI, PTY session manager, auth model, and persistence layout without adding new requirements or contradicting `docs/REQUIMENT.md`.

**Tech Stack:** Markdown; source references from `package.json`, `src/cli/index.ts`, `src/server/index.ts`, `src/server/sessions/agent-catalog.ts`, `docs/REQUIMENT.md`, and `docs/E2E-TEST-PLAN.md`.

---

### Task 1: Write README

**Files:**
- Modify: `README.md`

- [x] **Step 1: Replace the placeholder title with a complete README**

Use this structure:

```markdown
# RemoteBridge

Short description and Phase 1 status.

## What It Does
## Phase 1 Scope
## Requirements
## Quick Start
## Development
## CLI
## Configuration
## Security Model
## Persistence
## Testing
## Project Structure
## Notes for Contributors
```

- [x] **Step 2: Verify documented commands exist**

Run:

```bash
npm run build
npm test
```

Expected: both commands complete successfully.

- [x] **Step 3: Review for scope drift**

Confirm the README states that only Claude Code is enabled in Phase 1, while Gemini CLI, OpenCode, and Codex are disabled stubs.
