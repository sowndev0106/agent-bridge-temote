import { spawn } from 'child_process'

console.log('Spawning codex...')
const child = spawn('/home/sown/.local/bin/codex', ['app-server', '--listen', 'stdio://'])

child.stdout.on('data', (data) => {
  console.log('[STDOUT]:', data.toString())
})

child.stderr.on('data', (data) => {
  console.log('[STDERR]:', data.toString())
})

child.on('close', (code) => {
  console.log('Exited with code:', code)
})

// Send initialize request after 1 second
setTimeout(() => {
  const req = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      clientInfo: { name: 'remotebridge', version: '1.0.0' }
    }
  }
  console.log('Writing request to stdin:', JSON.stringify(req))
  child.stdin.write(JSON.stringify(req) + '\n')
}, 1000)

// Terminate after 5 seconds
setTimeout(() => {
  console.log('Terminating process...')
  child.kill()
  process.exit(0)
}, 5000)
