# How to Publish to npm

This guide explains how to publish the `wacrawl-dashboard` package to npm, based on the current monorepo setup.

## What gets published

The root package (`wacrawl-dashboard`) is the publishable package.

- The CLI entry is `bin/wacrawl-dashboard.js`
- The published files are:
  - `apps/api/dist`
  - `apps/web/dist`
  - `bin`
- `prepublishOnly` runs `npm run build`, so API and web build output is prepared automatically before publish.

## 1. One-time setup (local machine)

1. Create an npm account (if you do not have one):
   - https://www.npmjs.com/signup
2. Verify access to the package name:
   - `npm view wacrawl-dashboard`
3. Log in to npm from terminal:
   - `npm login`
4. Verify you are logged in:
   - `npm whoami`

## 2. Prepare a release version

1. Make sure you are on the branch you release from (usually `main`).
2. Install dependencies cleanly:
   - `npm ci`
3. Run checks:
   - `npm run test`
   - `npm run typecheck`
   - `npm run build`
4. Bump version in root `package.json`:
   - Patch release: `npm version patch`
   - Minor release: `npm version minor`
   - Major release: `npm version major`

This updates `package.json`, creates a git tag, and commits the version change.

## 3. Dry-run the publish (recommended)

1. See what files npm will pack:
   - `npm pack --dry-run`
2. Confirm expected output includes:
   - `bin/wacrawl-dashboard.js`
   - `apps/api/dist/**`
   - `apps/web/dist/**`

If output is wrong, fix package metadata before publishing.

## 4. Publish manually

Run from repository root:

```bash
npm publish --access public
```

Notes:

- `--access public` is required for first publish of a scoped package, and safe to keep for public packages.
- Since `prepublishOnly` exists, build will run automatically before publish.

## 5. Verify published package

1. Check npm page:
   - https://www.npmjs.com/package/wacrawl-dashboard
2. Test install via npx:
   - `npx wacrawl-dashboard@latest`
3. Verify expected startup behavior on `http://127.0.0.1:3001`.

## 6. Publish via GitHub Actions (recommended for consistency)

You already have a workflow file at `.github/workflows/publish.yml` with checkout, Node setup, install, and build.

To make CI publish to npm, add these two steps after build:

```yaml
      - name: Publish to npm
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Verify package metadata
        run: npm view wacrawl-dashboard version
```

Then configure secrets:

1. Create an npm automation token in npm account settings.
2. In GitHub repo settings, add secret `NPM_TOKEN` with that value.
3. Trigger publish either by:
   - Creating a GitHub Release (workflow already listens to `release.published`), or
   - Running workflow manually (`workflow_dispatch`).

## 7. Suggested release flow for this repo

1. Merge release PR to `main`.
2. Run local verification (`test`, `typecheck`, `build`).
3. Bump version (`npm version patch|minor|major`).
4. Push commit and tag:
   - `git push && git push --tags`
5. Publish:
   - Manual (`npm publish --access public`), or
   - GitHub Release to trigger workflow.
6. Smoke test with:
   - `npx wacrawl-dashboard@latest`

## Common issues and fixes

- `npm ERR! 403` (forbidden):
  - You are not owner/collaborator on package, or token lacks permissions.
- Missing built assets after install:
  - Confirm `npm run build` succeeds and `files` includes dist folders.
- Wrong package version on npm:
  - Check `package.json` version and git tags before publishing.
- Workflow builds but does not publish:
  - Ensure `npm publish` step is present and `NPM_TOKEN` secret exists.

## Quick command checklist

```bash
npm ci
npm run test
npm run typecheck
npm run build
npm version patch
npm pack --dry-run
npm publish --access public
npx wacrawl-dashboard@latest
```
