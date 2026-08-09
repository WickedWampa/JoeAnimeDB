# Beta 12 patch handoff

Extract the patch ZIP into the JoeAnimeDB project root while on the intended release branch. Allow it to replace files with the same paths.

Then run:

```bash
npm ci
npm run test:release
npm run build
```

For the online Where to Watch gate, run:

```bash
npm run test:release:live
```

Do not tag or publish until every manual row in `BETA12_RELEASE_VERIFICATION.md` is complete and Cloudflare has proven an automatic production deployment from a push to `main`.

## Included changes

- Bumps npm and Android identities to `5.0.0-beta.12`.
- Makes `package.json` the web and desktop version source.
- Ensures a stale New User Mode flag cannot hide an existing desktop SQLite database after an installer update.
- Keeps the Electron preload sandbox-compatible so the desktop SQLite bridge loads correctly.
- Adds the automated Beta 12 release gate and CI workflow.
- Runs the release gate before Windows, Linux, and Android packaging.
- Includes the mobile and tablet JoeAI composer correction.
- Adds a focused UI consistency layer for Home, Library, and Anime Detail with unified typography, spacing, radii, and controls; actionable Home empty states; and non-overlapping phone and tablet hero statistics while preserving all themed artwork and effects.
- Includes the release checklist and Beta 12 release notes.

Generated `dist`, Android synced assets, installers, AppImages, and APKs are intentionally excluded. Rebuild them from source after extraction.
