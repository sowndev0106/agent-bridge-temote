# RemoteBridge — End-to-End Test Plan

How we prove Phase 1 works as a whole: a registered project launches a Claude session,
the remote link is captured and surfaced live, and the session can be stopped, restarted,
and deleted — all behind the auth/CSRF perimeter, without ever orphaning a process or
touching the developer's real config dir.

## Automated E2E — `tests/e2e/full-flow.test.ts`

Boots the **real** Fastify server (`createServer()` + `listen({ port: 0 })`), drives it over
real HTTP (`fetch`) and a real WebSocket (`ws`), and spawns a **real PTY** via node-pty.

The agent is a stand-in (`tests/fixtures/fake-agent.mjs`) wired in through config:
`agents.claude.command = node`, `args = [fake-agent.mjs]`. The fake agent prints the
verified Claude line — `… https://claude.ai/code/session_<ULID>` — then idles until killed,
so we exercise the genuine spawn → line-buffer → ANSI-strip → link-extract → WebSocket
broadcast path without needing the real `claude` binary or an Anthropic login.

`$HOME` is redirected to a throwaway sandbox (`tests/setup.ts`), so config, projects, and
sessions never land in the real `~/.remotebridge`.

### Run

```bash
npm test                                # whole suite (unit + e2e)
npx vitest run tests/e2e/full-flow.test.ts
```

### Scenarios & coverage

| # | Step | Asserts | Requirement |
|---|------|---------|-------------|
| 1 | GET /api/projects with no cookie | 401 | H5 |
| 2 | Login with wrong password | 401 | NFR3 |
| 3 | Login with correct password | 200, sets `rb_session` + `rb_csrf`, returns CSRF token | NFR3 |
| 4 | GET /api/config | 200, body has **no** `password`/`sessionSecret` | H7 |
| 5 | POST /api/projects without `X-CSRF-Token` | 403 | H6 |
| 6 | POST /api/projects with non-existent path | 400 | H9 |
| 7 | POST /api/projects (valid dir, with CSRF) | 201 | FR1 |
| 8 | WebSocket upgrade with no session cookie | rejected (401) | H5 (WS) |
| 9 | POST /api/sessions/launch (claude) | 201, state `launching` | FR3 |
| 10 | Fake agent prints link → WS `session.updated` | state `running`, `remoteLink` matches `https://claude.ai/code/session_…`; payload has **no** `logs`; a `session.log` event was also received | FR4, logs-strip invariant |
| 11 | DELETE the project while session live | 409 `project_in_use` | H15 |
| 12 | POST /api/sessions/:id/stop | session reaches `stopped` | FR5 |
| 13 | POST /api/sessions/:id/restart | session returns to `running` with a link | FR5 |
| 14 | Stop, then DELETE the session record | 200, gone from GET /api/sessions | FR5 |
| 15 | DELETE the project once no session is live | 200 | H15 cleared |

Process hygiene: `afterAll` calls `manager.killAll()` so the spawned PTY is never orphaned
(FR3 / ADR-0002).

### Not covered by the automated E2E (deliberate gaps)

- **Real `claude` binary.** The fake agent stands in for it; the real link pattern is pinned
  by `tests/sessions/link-extractor.test.ts` and CONTEXT.md. Re-verify on Claude Code major
  bumps (see the manual checklist below).
- **PM2 lifecycle** (`install`/`start`/`stop`, `--kill-timeout 6000`) — exercised manually.
- **Cross-platform** `.cmd` resolution (`resolveCommand`) — unit-level only; Windows untested here.
- **Rate-limit lockout** (10 logins/min, H12) — logic unit-tested; not driven E2E.

## Manual checklist (real `claude`, real PM2)

Run on a machine with `claude` installed and authenticated, and `pm2` on PATH.

1. `npm run build && node dist/bin/remotebridge.js install` → prompts password, registers PM2.
2. `remotebridge start` → `remotebridge status` shows online + URL.
3. Open the UI, log in, add a project pointing at a real repo.
4. Launch Claude → card goes `Launching…` → `Open Remote Control` within ~7s (NFR2). Verify
   the link opens a working session in a new tab.
5. Stop, restart, and delete the session from the card.
6. `remotebridge restart` (PM2) → confirm the running agent is killed, not orphaned
   (`ps` shows no stray `claude`), and prior sessions show `stopped` in the UI (ADR-0002).
7. Hard-rule spot checks: `curl` a protected route with no cookie → 401; `GET /api/config`
   → no secrets; start with `host=0.0.0.0` and no password → refuses with a setup guide (H2);
   `ls -la ~/.remotebridge` → dir `700`, files `600` (H11, Unix).
8. **Link pattern re-verify:** confirm the stdout line still matches
   `https://claude\.ai/code/session_[\w]+`; update the catalog + CONTEXT.md if it changed.
