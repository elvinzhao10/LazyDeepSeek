# Native Harness UI acceptance — 1.4.1

Validated on 2026-11-01 in an isolated, credential-free DeepSeek Harness **0.2.1-rc.5 Web client**, using the actual packed plugin and the host's client-module loader, SettingsForm, Config forms and subagent service. This is a native-host probe, not a replacement UI or a claim about a running Desktop conversation. The six MCP rows were disabled only in this UI fixture; their package/install checks are separate. No model requests were sent.

Observed cases:

- The LazyDeepSeek card appears in the native Plugins page and opens its native settings panel.
- Fractional delegation depth and zero active-subagent capacity are rejected before Save. Parsing follows the official Subagent page: safe integers, depth at least zero, capacity at least one, and negative zero rejected.
- Saving capacity three through LazyDeepSeek is reflected as three in the official Subagent page. The two pages use the same Host namespace and revisioned write service.
- Reset and Save remove the override and restore the inherited capacity of eight in the isolated profile.
- The panel is checked at 390 CSS pixels with iPhone-14 emulation and at 1440 pixels, in light/dark mode. Host-owned layout and controls remain in use; no custom CSS or second framework is shipped.

To reproduce manually, open Plugins → LazyDeepSeek. Try a fractional depth, restore a valid depth, save a supported capacity, inspect the official Subagent page, then Reset and Save. Perform writes only in an approved test profile; do not change a user's delegation settings merely to check package readiness.

The Desktop package update needs a full application restart. The current user's pending task was preserved rather than interrupted. Model-driven role dispatch, hook delivery and six project-bound MCP round trips remain deferred.
