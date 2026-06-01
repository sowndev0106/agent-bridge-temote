import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'bin/arc': 'bin/arc.ts',
    'server/index': 'src/server/index.ts'
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  tsconfig: 'tsconfig.server.json'
})
