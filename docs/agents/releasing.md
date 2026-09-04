# Releasing

`package.json`, the `CHANGELOG.md` heading, and the Git tag must contain the same version. A `v0.1.0` tag therefore publishes `secret-input@0.1.0`. Before tagging, run the full checks, extract the release notes with `vp exec releaselog --format notes v0.1.0`, and inspect `vp pm pack -- --dry-run --json`.

The release workflow verifies the complete package and browser matrix before publishing. Its `npm-publish` environment holds release credentials and may apply approval rules. Keep write and OIDC permissions scoped to the release job.

The first npm release requires a granular write token in the environment secret `NPM_TOKEN`, because npm cannot attach a trusted publisher to a package that does not exist yet. After the first publish, configure the package's npm trusted publisher for GitHub user `Justineo`, repository `secret-input`, workflow `release.yml`, and environment `npm-publish`, with direct publishing allowed. Then delete `NPM_TOKEN`; the same workflow will publish through OIDC.

Do not create or move the release tag until the release commit is on `main` and CI is green. If a tag workflow fails before npm publication, fix the cause on `main`, move the tag to that verified commit, and retry. Never reuse a version that reached the npm registry.
