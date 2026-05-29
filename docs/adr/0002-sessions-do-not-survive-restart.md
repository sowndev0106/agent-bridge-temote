# Agent sessions do not survive a RemoteBridge restart

Agent processes are spawned through node-pty handles held in memory. Those handles do
not survive a restart of the RemoteBridge process, so after a restart we can no longer
read from, stop, or otherwise control a previously running agent.

Decision:
- **On shutdown** (SIGINT/SIGTERM — e.g. PM2 stop/restart), RemoteBridge kills every
  agent it spawned (`SessionManager.killAll()`) before exiting, so nothing is orphaned.
- **On startup**, every prior `launching`/`running` session is marked `stopped`. We do
  **not** try to re-attach, and we do **not** kill by the stored PID — that PID may have
  been reused by an unrelated process, and killing it would violate H1/H10. If the old
  PID still looks alive we only log a warning.

Trade-off: a session cannot be resumed across a restart, and in the rare case where an
agent ignores SIGHUP and our kill-all didn't reach it (e.g. hard crash of RemoteBridge),
an orphan may linger until the user kills it manually. We accept this over the larger
risk of killing the wrong process via a reused PID.
