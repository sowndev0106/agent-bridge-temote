import type { FastifyInstance } from 'fastify'
import { BUILT_IN_AGENTS, resolveAgent } from '../sessions/agent-catalog.js'
import { loadConfig } from '../core/config.js'

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.get('/api/agents', async () => {
    const config = await loadConfig()
    const agents = BUILT_IN_AGENTS.map(a => resolveAgent(a.id, config.agents)!)
    return { ok: true, data: agents }
  })
}
