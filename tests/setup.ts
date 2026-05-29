import { join } from 'path'
import { tmpdir } from 'os'

// Redirect HOME to a throwaway sandbox BEFORE any test module (and the top-level
// os.homedir() consts in config.ts / projects.ts / sessions.ts) loads, so tests never
// touch the developer's real ~/.remotebridge. setupFiles run before test files are imported.
const SANDBOX_HOME = join(tmpdir(), 'rb-vitest-home')
process.env.HOME = SANDBOX_HOME
process.env.USERPROFILE = SANDBOX_HOME
