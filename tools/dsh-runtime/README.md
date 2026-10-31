# Audited DeepSeek Harness runtime

This private root application pins the native dsh host and patched transitive dependencies. It is separate from the installable LazyDeepSeek plugin bundle. Use the checked-in lockfile with `npm ci`; do not add these overrides only inside the plugin package or hand-edit an installed dependency tree.

The full setup, native checks, installation boundaries and upstream caveats are in [the audited runtime guide](../../docs/reference/audited-dsh-runtime.md). Repository validation does not change existing profiles or the global `dsh` executable.
