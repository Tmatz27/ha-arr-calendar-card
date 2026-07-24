# Publishing a full release

> **Development disclosure:** This repository is coded and maintained with the
> assistance of OpenAI Codex.

HACS discovers updates from GitHub releases. Merging the release pull request
updates `main`, but it does **not** publish a HACS update until a newer tag and
GitHub release exist.

## 1. Merge the pull request

1. Open the pull request on GitHub and confirm that the validation check passes.
2. Choose **Merge pull request** (not “close”), then confirm the merge.
3. Confirm that `main` contains the updated `arr-calendar-card.js` and that its
   `CARD_VERSION` matches the version in `package.json`.

Merging a version change into `main` runs the release workflow automatically.
The workflow validates the repository, creates the matching version tag and
GitHub release when one does not already exist, attaches
`arr-calendar-card.js`, and removes merged non-default branches.

The workflow can also be run manually from the Actions tab if a previous run
was interrupted.

## 2. Verify v0.5.0

On GitHub, verify that **Releases** shows `v0.5.0`, the tag points to the merge
commit on `main`, and the JavaScript file is attached. Do not reuse or silently
move a published release tag after users may have installed it; increment the
patch version instead.

## 3. Refresh HACS and Home Assistant

1. In HACS, open **Arr Calendar Card** and select **Update** to `v0.5.0`.
2. Wait for the download to finish, then perform a hard refresh of the Home
   Assistant browser or fully close and reopen the companion app.
3. In the browser developer console, confirm the card banner reports `v0.5.0`.

If HACS still shows the old version, confirm that the GitHub release is published
(not a draft), its tag is newer than the prior release, and the tag points to the
merge commit on `main`.
