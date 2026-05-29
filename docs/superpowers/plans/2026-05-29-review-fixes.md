# Plan — Architecture Review Fixes

Addresses findings from the codebase architecture review of `feat/phase1-implementation`.
Ordered so the test suite stays green throughout; the history rewrite is last.

## 1. Repo hygiene (blocker)
- `node_modules/` was committed in two early commits (before `.gitignore` existed).
- Fix: after all code changes land, rewrite the branch with
  `git filter-branch --index-filter "git rm -r --cached --ignore-unmatch node_modules" --prune-empty main..HEAD`
  (range-limited so the shared base with `main` is untouched). Verify `git ls-files | grep node_modules` is empty.

## 2. DRY — centralize persistence paths
- `PROJECTS_FILE` is duplicated in `routes/projects.ts` and `routes/sessions.ts`.
- New `src/server/core/paths.ts` exporting `CONFIG_DIR`, `CONFIG_FILE`, `PROJECTS_FILE`, `SESSIONS_FILE`
  (config.ts re-exports CONFIG_DIR/CONFIG_FILE from here to avoid churn). Routes + index import from it.

## 3. Security — require sessionSecret
- `validateConfig` doesn't require `sessionSecret`; running without `install` would sign tokens with `""`.
- Add: error when `sessionSecret` is empty (with `remotebridge install` pointer). Test files set one, so unaffected.

## 4. H11 — Windows owner-only ACL
- `ensureDir` only `chmod 0700` (noop on Windows). Spec requires an `icacls` fallback.
- Add `applyOwnerOnlyAcl(path)` in persistence: on win32, run `icacls <path> /inheritance:r /grant:r <user>:F`;
  log a warning and continue on failure (never abort). No-op on POSIX (chmod already covers it).

## 5. Robustness — body validation
- Replace `request.body as {...}` casts with Fastify JSON schemas on mutating routes
  (auth login, projects POST/PUT, sessions launch, config PUT). Malformed bodies → 400 before handler.

## 6. WS heartbeat
- Add server ping every 30s; terminate sockets that didn't pong. Prevents half-open sockets lingering.

## 7. Frontend — design tokens (AGENTS.md convention)
- Create `src/web/theme.css` with `--color-*` custom properties (dark palette).
- Map semantic color names in `tailwind.config.ts` to those vars (`bg`, `surface`, `border`, `text`,
  `muted`, `accent`, `accent-hover`, `success`, `warn`, `danger`).
- Refactor components to use semantic token classes instead of raw `gray/blue/...` utilities. Layout/spacing
  utilities stay. Import `theme.css` from `main.tsx`.

## 8. Minor — name the restart delay
- Extract the magic `200` in `SessionManager.restart()` to a named constant with a comment.

## 9. Tests (close grill-fix gaps)
- `tests/routes/config.test.ts`: `PUT /api/config` with `password` stores a bcrypt hash (not plaintext)
  and a subsequent login verifies (H4); `sessionSecret` in body is ignored.
- `tests/core/config.test.ts`: `validateConfig` flags empty `sessionSecret`.
- Restart concurrency cap: covered via a route/manager test (or assert in E2E).

## Verification
- `npx tsc -p tsconfig.server.json --noEmit` and `-p tsconfig.json` clean.
- `npm test` green (target ≥ current 55 + new).
- `npm run build` succeeds; prod server still serves SPA.
- `git ls-files | grep -c node_modules` → 0.
