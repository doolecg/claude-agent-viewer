---
name: release
description: Ship a new version of Claude Agent Viewer. Bumps the version, tags and pushes, watches the GitHub Actions MSI build, then checks the release and writes its notes. Use when asked to release, ship, publish, cut or bump a new version. Optional argument: patch | minor | major | an exact version like 1.4.0.
---

# Release Claude Agent Viewer

Pushing a `v*` tag runs `.github/workflows/release.yml` on a Windows runner. It builds
`dist/Claude-Agent-Viewer-<version>.msi` and publishes it as the GitHub release for that tag.
Installed copies find it through `updater.js`, which downloads the MSI and shows the
"Update" pill. **Anything you release goes to every installed user**, so don't skip the checks.

Work in the repo root. The shell is Git Bash on Windows.

## 1. Preflight — stop and report if any of these fail
```bash
git switch main && git pull --ff-only
git status --short        # must be clean; ask before committing stray changes
npm ci && npm test
last=$(git describe --tags --abbrev=0); echo "$last"
git log "$last"..HEAD --oneline
```
- No commits since `$last`: there's nothing to release. Say so and stop.
- Syntax checks aren't enough if `main.js`, `renderer/` or `updater.js` changed: launch the
  app (`npm start`) or run `npm run dist` and start `dist/win-unpacked/Claude Agent Viewer.exe`
  briefly. Make sure it stays up and spawns a `claude.exe` child, then kill what you started.

## 2. Pick the version
- If an argument was given, use it.
- Otherwise read the commits since `$last`: **minor** if any add a feature, **patch** for fixes
  only. Use **major** only when the user asks for it.
- The version must be higher than the last one. The updater only offers versions higher than
  the installed one, and the MSI only upgrades to a higher version.

## 3. Bump, commit, tag
Don't use plain `npm version`. It writes its own commit message, and this repo's commits need
the attribution lines.
```bash
npm version <bump-or-version> --no-git-tag-version   # updates package.json + package-lock.json
v=$(node -p "require('./package.json').version")
git add package.json package-lock.json
git commit -m "Release v$v" -m "<attribution lines from the session's instructions>"
git tag "v$v"
```
The workflow fails the build if the tag doesn't match `package.json`, so always tag from the
bumped version.

## 4. Push and watch the build
```bash
git push --follow-tags
sleep 5
run=$(gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$run" --exit-status --interval 20 > /dev/null; echo "exit $?"
```
The build takes about 5 minutes. On failure, run `gh run view "$run" --log-failed`, find the
cause, fix it on `main`, and **release the next patch version**. Never move or re-push an
existing tag without asking the user: installed copies may already have seen it.

## 5. Check the release and write its notes
```bash
gh release view "v$v" --json assets,url -q '.url, (.assets[] | .name + " " + (.size|tostring))'
```
- There must be exactly one asset named `Claude-Agent-Viewer-$v.msi`, about 120 MB. If it's
  missing, the updater has nothing to install, so fix that before anything else.
- The workflow's auto-generated notes are nearly empty for direct commits. Replace them with
  user-facing bullets written from `git log "$last"..HEAD`: what changed for someone using the
  app, not commit subjects. End with the install line:
  ```bash
  gh release edit "v$v" --notes-file notes.md   # write notes.md in the scratchpad, not the repo
  ```
  Install line: `Install: download the .msi and run it (per-user, no admin). Existing installs update themselves.`

## 6. Report
Report the version, the release URL, the run URL, and the notes. Also say whether the app was
actually launched in step 1 or only syntax-checked.
