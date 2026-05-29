/**
 * Build the environment for a PTY-spawned shell or agent.
 *
 * RemoteBridge may be launched from a context that disables color (e.g. an IDE/VSCode
 * task sets NO_COLOR=1, or TERM=dumb). That env is inherited via process.env and, if
 * passed through unchanged, makes TUIs like `claude` emit no color at all — even though
 * the xterm.js frontend renders full truecolor. So we:
 *   - drop NO_COLOR (the no-color.org opt-out) and FORCE_COLOR (so detection wins)
 *   - force TERM=xterm-256color and COLORTERM=truecolor so supports-color reports 16M
 *
 * `overrides` are applied last (e.g. per-agent / per-project env).
 */
export function buildTerminalEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = { ...process.env, ...overrides } as Record<string, string>
  delete env.NO_COLOR
  delete env.FORCE_COLOR
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return env
}
