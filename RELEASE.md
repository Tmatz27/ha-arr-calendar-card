# Publishing a full release

HACS discovers updates from GitHub releases. Merging the release pull request
updates `main`, but it does **not** publish a HACS update until a newer tag and
GitHub release exist.

## 1. Merge the pull request

1. Open the pull request on GitHub and confirm that the validation check passes.
2. Choose **Merge pull request** (not “close”), then confirm the merge.
3. Confirm that `main` contains the updated `arr-calendar-card.js` and that its
   `CARD_VERSION` matches the version in `package.json`.

With GitHub CLI, the equivalent commands are:

```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
git switch main
git pull --ff-only origin main
```

## 2. Publish v0.4.1

The repository includes a release workflow. Push the version tag from the
updated `main` branch:

```bash
git switch main
git pull --ff-only origin main
git tag -a v0.4.1 -m "Arr Calendar Card v0.4.1"
git push origin v0.4.1
```

The tag starts `.github/workflows/release.yml`, which validates the repository,
creates the GitHub release, and attaches `arr-calendar-card.js`. On GitHub,
verify that **Releases** shows `v0.4.1` and that the JavaScript file is attached.

If the tag was accidentally created from the wrong commit, delete it before
trying again:

```bash
git tag -d v0.4.1
git push origin :refs/tags/v0.4.1
```

Then update `main`, recreate the tag, and push it again. Do not reuse or silently
move a published release tag after users may have installed it; increment the
patch version instead.

## 3. Refresh HACS and Home Assistant

1. In HACS, open **Arr Calendar Card** and select **Update** to `v0.4.1`.
2. Wait for the download to finish, then perform a hard refresh of the Home
   Assistant browser or fully close and reopen the companion app.
3. In the browser developer console, confirm the card banner reports `v0.4.1`.

If HACS still shows the old version, confirm that the GitHub release is published
(not a draft), its tag is newer than the prior release, and the tag points to the
merge commit on `main`.
