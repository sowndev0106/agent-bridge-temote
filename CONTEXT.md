---
name: remotebridge-context
description: Domain glossary and verified ground truth for RemoteBridge
metadata:
  type: project
---

# RemoteBridge — Domain Glossary

## Terms

### Remote Link
The URL that an AI agent prints to stdout when it activates remote control mode. RemoteBridge captures this URL via regex and surfaces it in the browser.

**Verified (claude v2.1.156, 2026-05-29):**
The exact stdout line Claude Code emits is:
```
/remote-control is active · Continue here, on your phone, or at  https://claude.ai/code/session_01HjuhkefR1roLvgeB2xizbG
```
URL format: `https://claude.ai/code/session_<ULID>`
- Path segment is `session_` (singular, underscore — NOT `sessions/`)
- ID is a ULID (26 chars, base32 Crockford, alphanumeric, no hyphens)

**Correct link pattern for Claude Code:** `https://claude\.ai/code/session_[\w]+`

> ⚠ Pattern must be re-verified on each major Claude Code version bump.

### Session
A running instance of an AI agent spawned by RemoteBridge for a specific Project. A Session has a lifecycle state machine: `launching → running → stopped / failed`.

### Project
A registered filesystem directory with a display name and optional per-project environment variables. The user selects a Project before launching a Session.

### Agent Catalog
The built-in registry of supported AI agents. Each entry defines the command, default args, env vars, and link pattern. Phase 1: only Claude Code is enabled. All others are stubs (`enabled: false`).

### PTY Requirement
Claude Code (and similar interactive agents) detect whether stdin/stdout is a TTY at startup. Without a TTY they immediately switch to `--print` mode and exit with an error. RemoteBridge must use `node-pty` to spawn agents — not `child_process.spawn` with pipes. The trust prompt ("Is this a project you trust?") is auto-accepted by writing `\r` to the PTY because the user implicitly trusted the directory when registering it as a Project.

### Link Extractor
The component that reads each stdout line from an agent process and matches it against the agent's `linkPattern` regex. On first match, it updates the Session state to `running` and records the Remote Link.

### Session State Machine
```
launching → running → stopped
          ↓
        failed  (timeout or crash before link found)
```
A stopped session can be restarted (re-enters `launching`).

### Config Directory
- Linux/macOS: `~/.remotebridge/`
- Windows: `%APPDATA%\remotebridge\`

All files written atomically (temp file + rename). Directory mode `0700`, files mode `0600` (Unix only).
