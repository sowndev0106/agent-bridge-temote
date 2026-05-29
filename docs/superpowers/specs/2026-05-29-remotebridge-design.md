---
name: remotebridge-design
description: Full system design for RemoteBridge — Node.js npm app that launches local AI agents and surfaces their remote control links in a browser UI
metadata:
  type: project
---

# RemoteBridge — System Design Spec

## Summary

RemoteBridge is a Node.js CLI app (`npm install -g remotebridge`) that:
1. Manages project directories and AI agent configurations
2. Spawns AI agents (Claude Code, Gemini, OpenCode, Codex) as OS processes with correct `cwd` and env vars
3. Captures the remote URL printed to stdout via regex
4. Surfaces that URL in a React web UI via WebSocket

Full spec: [REQUIMENT.md](../REQUIMENT.md)  
Frontend layout: [DESIGN.md](../DESIGN.md)

## Architecture Decision

Approach B chosen: **Fastify + WebSocket real-time control plane**.

- Backend: Node.js 20 / Fastify
- Frontend: React 18 + Vite + TailwindCSS (static, served by Fastify)
- Realtime: WebSocket (`ws`)
- Persistence: JSON files at `~/.remotebridge/`
- Process management: PM2 (for RemoteBridge itself, not agent sessions)
- Distribution: `npm install -g remotebridge`

## Key Constraints

- Single user, single host (local Ubuntu machine)
- Bind `0.0.0.0` by default (configurable) — password required when not 127.0.0.1
- No Docker for v1 — agents spawn as direct OS processes
- User manages their own AI service auth — RemoteBridge only launches and relays link
- Agent command sourced only from built-in catalog or config, never from client payload

## Why Not Angular + Spring

Original draft proposed Angular + Spring. Revised to Node.js + React because:
- Single-user local tool doesn't need JVM weight
- npm-installable aligns with Node.js/React ecosystem
- Consistent with similar tools in this space (agent-remote-control uses same stack)
- PM2 process management is idiomatic for Node.js services

## Verified Link Pattern (claude v2.1.156, 2026-05-29)

`claude --remote-control` emits this stdout line when ready:
```
/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_<ULID>
```
Correct pattern: `https://claude\.ai/code/session_[\w]+`
- `session_` (singular, underscore) — NOT `sessions/`
- ID is a ULID (alphanumeric, no hyphens)

Must re-verify on major Claude Code version bumps.
