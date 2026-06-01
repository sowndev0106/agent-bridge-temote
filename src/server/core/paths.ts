import { homedir } from 'os'
import { join } from 'path'

// Single source of truth for everything under ~/.agent-remote-control. Resolved from os.homedir()
// (honors $HOME on POSIX; tests redirect it to a sandbox). Imported everywhere instead of
// re-deriving the paths per module.
export const CONFIG_DIR = join(homedir(), '.agent-remote-control')
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
export const PROJECTS_FILE = join(CONFIG_DIR, 'projects.json')
export const SESSIONS_FILE = join(CONFIG_DIR, 'sessions.json')
