// Stand-in for `claude --remote-control` used by the E2E test.
//
// It does NOT need to check for a TTY (the real claude does, which is why the manager
// spawns through node-pty). It just emits a Claude-style remote-link line on stdout —
// matching the verified pattern https://claude.ai/code/session_<ULID> — then idles so
// the session stays in 'running' until RemoteBridge stops it. Exits cleanly on SIGTERM.
//
// An optional first arg "trust" makes it first print a trust prompt, exercising the
// auto-accept path in SessionManager.launch().

const mode = process.argv[2]

process.stdout.write('fake-agent: booting\n')

if (mode === 'trust') {
  process.stdout.write('Is this a project you trust? 1. Yes  2. No\n')
}

setTimeout(() => {
  process.stdout.write(
    '/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_01HFAKEULID0123456789ABCD\n'
  )
}, 150)

// Keep the process alive until RemoteBridge signals it.
const keepAlive = setInterval(() => {}, 1 << 30)
const shutdown = () => { clearInterval(keepAlive); process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
