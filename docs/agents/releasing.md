# Releasing

`package.json`, the `CHANGELOG.md` heading, and the Git tag must contain the same version. For example, a `v0.1.1` tag publishes `secret-input@0.1.1`. Before tagging an unpublished version, run the full checks, extract its release notes with `vp exec releaselog --format notes v0.1.1` (using the intended version), and inspect `vp pm pack -- --dry-run --json`.

The release workflow verifies the complete package and browser matrix before publishing. Its `npm-publish` environment identifies the trusted publishing context and may apply approval rules. Keep write and OIDC permissions scoped to the release job.

Publishing uses npm Trusted Publishing (OIDC), following [vue-echarts](https://github.com/ecomfe/vue-echarts/blob/b2f706afa5858c1c979611cbde05a4669df9f7a3/.github/workflows/release.yml). The workflow grants `id-token: write`, updates npm before publishing, and does not use `NPM_TOKEN` or `NODE_AUTH_TOKEN`. The npm update runs outside the checkout because this project's `devEngines.packageManager` requires pnpm. See [npm's trusted publishing requirements](https://docs.npmjs.com/trusted-publishers/).

Configure the package's npm trusted publisher for GitHub user `Justineo`, repository `secret-input`, workflow `release.yml`, and environment `npm-publish`, with direct `npm publish` allowed. These values must match the workflow exactly; GitHub's environment settings alone do not establish trust on npm.

The initial `0.1.0` release was published interactively on September 7, 2026, before configuring trusted publishing. It already exists on npm; do not trigger this tag workflow for `v0.1.0`, since that would attempt to publish the same version again. Subsequent versions use the OIDC workflow.

Do not create or move the release tag until the release commit is on `main` and CI is green. If a tag workflow fails before npm publication, fix the cause on `main`, move the tag to that verified commit, and retry. Never reuse a version that reached the npm registry.
