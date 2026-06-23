// ecosystem.config.cjs — pm2 process manager config for agent-remote-control.
//
// Usage:
//   pm2 start ecosystem.config.cjs          # start (or reload) the service
//   pm2 stop   arc                          # stop
//   pm2 restart arc                          # restart
//   pm2 delete arc                           # remove from pm2
//   pm2 save                                 # persist current process list
//   pm2 logs   arc --lines 100              # tail logs
//
// After changing this file: `pm2 reload ecosystem.config.cjs` to apply.
//
// Notes:
//   * autorestart=true + max_restarts=10  → pm2 restarts on crash.
//   * max_memory_restart=300M              → restart if RSS > 300MB (prevents leaks).
//   * kill_timeout=6000                    → wait 6s for graceful SIGTERM → SIGKILL
//                                            (matches the in-app shutdown handler in
//                                            src/server/index.ts that kills child PTYs).
//   * env.PORT removed; the app reads RB_PORT or falls back to 4444 (default).

module.exports = {
  apps: [
    {
      name: 'arc',
      script: '/home/sown/.nvm/versions/node/v22.18.0/lib/node_modules/agent-remote-control/dist/server/index.js',
      cwd: '/home/sown',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,

      // Auto-restart on crash.
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      max_memory_restart: '300M',

      // Graceful shutdown — must match the in-app SIGTERM handler in
      // src/server/index.ts (which kills all spawned agent PTYs).
      kill_timeout: 6000,
      listen_timeout: 8000,
      shutdown_with_message: false,

      // Logs.
      out_file: '/home/sown/.pm2/logs/arc-out.log',
      error_file: '/home/sown/.pm2/logs/arc-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Env. App reads RB_PORT; default in src/server/core/config.ts is 4444.
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
