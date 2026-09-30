# Contributing to LazyDeepSeek

Thank you for improving LazyDeepSeek. Keep changes focused, preserve the package
boundary, and avoid adding host configuration, credentials, or generated local
state to commits.

## Before opening an issue

Search existing issues first. For a bug report, include the LazyDeepSeek version,
host version, operating system, exact reproduction steps, and sanitized output
from the verification command. Do not paste tokens, credentials, or private
workspace paths.

## Pull requests

Create one focused branch and describe the user-visible change, compatibility
impact, and verification in the pull request template. Keep pull requests
small and update documentation or `plugins/lazydeepseek/CHANGELOG.md` when public
behavior changes.

Run these checks from `plugins/lazydeepseek/` before requesting review:

```bash
bash scripts/lazydeepseek-load-check.sh
bash scripts/lazydeepseek-verify.sh            # suites: LAZYDEEPSEEK_VERIFY_SUITE=core|all|lifecycle|language (default all)
bash tests/publication-regression.sh
node scripts/check-product-naming.js       # run from the repository root
```

`scripts/lazydeepseek-verify.sh` runs Node tests with conservative concurrency:
set `LAZYDEEPSEEK_NODE_TEST_CONCURRENCY` to an integer from 1 through 4 (default 2).
The CI workflow runs the same release-relevant checks on every pull request.

## Releases

Use a version tag in the form `vX.Y.Z` only after the default-branch CI is
green and the changelog documents the user-facing change. Bump the
`version` in the root `package.json` and regenerate
`plugins/lazydeepseek/contracts/dsh-route-contract.v1.json`
(`node plugins/lazydeepseek/scripts/lazydeepseek-regenerate-route-contract.js`)
together so the route boundary stays verifiable for
the new release. The tag-release workflow creates GitHub release notes from
merged pull requests and labels. Review the generated notes before publishing
a prerelease or major release.
