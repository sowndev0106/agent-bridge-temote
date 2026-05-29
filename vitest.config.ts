import { defineConfig } from 'vitest/config'
import { join } from 'path'
import { tmpdir } from 'os'

// Separate from vite.config.ts (which sets root: src/web for the SPA build).
// Tests live at the repo root under tests/ and import from src/.
//
// HOME is redirected to a throwaway sandbox so modules that resolve the config dir
// from os.homedir() at import time (config.ts, projects.ts, sessions.ts) read/write
// under /tmp instead of the developer's real ~/.remotebridge. Set via test.env so it
// applies BEFORE test modules (and their top-level homedir() consts) load.
const SANDBOX_HOME = join(tmpdir(), 'rb-vitest-home')

export default defineConfig({
  root: '.',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 'forks' (child_process), not the default worker threads: os.homedir() reads the
    // native env via libuv getenv(), which only reflects process.env mutations in a real
    // process — in a worker thread setup.ts's HOME override wouldn't reach it.
    pool: 'forks',
    // setupFiles run before test modules import, so HOME is redirected before any
    // top-level os.homedir() const evaluates.
    setupFiles: ['tests/setup.ts'],
    env: { HOME: SANDBOX_HOME, USERPROFILE: SANDBOX_HOME }
  }
})
