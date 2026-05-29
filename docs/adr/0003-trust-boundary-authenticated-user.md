# The authenticated user is fully trusted; security is perimeter-only

RemoteBridge's threat model is a single trusted operator on their own machine. The
adversary is an **unauthenticated network party** (the app binds `0.0.0.0` by default),
not the logged-in user. Session auth, CSRF (H5/H6), the `password`/`sessionSecret`
config exclusion (H7), and "command never from the launch payload" (H8) all exist to
keep *outsiders* out — none of them constrain what the authenticated user may do.

Consequences:
- Setting an arbitrary `agents.*.command` via `config.json` or `PUT /api/config` is an
  **intended** power-user capability, not a vulnerability. H8 only forbids taking the
  command from the raw `/api/sessions/launch` payload.
- `PUT /api/config` MUST bcrypt-hash a `password` field before saving (the CLI already
  does; the route must match), so H4 holds and the user can't lock themselves out by
  writing a plaintext password the bcrypt-compare login path will reject.

Rejected: locking the config API to a safe-field whitelist, and spawn-time command
allowlisting. Both add friction that only pays off against a hostile logged-in user —
which, by this model, does not exist.
