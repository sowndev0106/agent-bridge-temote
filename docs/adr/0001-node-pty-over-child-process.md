# Spawn agents with node-pty, not child_process

We spawn AI agents through `node-pty` (a real PTY) instead of `child_process.spawn`,
because Claude Code and similar interactive agents check for a TTY at startup and
exit (or drop to `--print` mode) when spawned with plain pipes. The cost: node-pty
is a native module (needs a compile/prebuilt binary per platform), and stdout/stderr
are merged into a single data stream — we lose the ability to distinguish them.

Consequences:
- Link extraction and logging read **one merged line stream**, not separate stdout/stderr.
- Process termination uses node-pty's `child.kill()` (SIGTERM→SIGKILL on Unix; node-pty
  maps to the correct Windows call) — we do **not** call `child_process` / `taskkill` directly.
- On Windows, npm global-bin `.cmd` shims must be resolved manually (`resolveCommand()`),
  because node-pty does not do it automatically.
- **Distribution pre-flight:** before publishing, confirm the pinned node-pty version ships
  prebuilt binaries for the target matrix (linux x64/arm64, darwin x64/arm64, win32 x64) on
  Node 20's ABI — otherwise `npm install -g` compiles from source and fails on toolchain-less
  machines. `remotebridge install` smoke-tests `import('node-pty')` and prints a per-OS
  build-toolchain remediation message on failure rather than letting node-gyp errors surface raw.
