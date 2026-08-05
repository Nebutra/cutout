# Design: Cutout v0.1.19 release and local replacement

## Release boundary

`release/v0.1.19-rc@8c6151e` is the reviewed product-candidate baseline and
descends directly from `github/main@6f02c5a`. The release task record is the
only allowed follow-up commit before freezing the branch SHA. Publication
advances GitHub `main` through a reviewed PR; the tag is created only from that
resulting remote-main commit.

## Publication flow

1. Validate the clean candidate and release contracts locally.
2. Push the candidate branch and merge its GitHub PR after checks pass.
3. Fetch and validate the exact remote-main merge commit.
4. Create and push annotated `v0.1.19` once.
5. Verify the tag workflow identity; approve only its protected environment
   deployment if GitHub requires approval.
6. Wait for the single publish job to build, sign, notarize, attest, and promote
   the complete draft Release.
7. Download and independently verify public evidence before local installation.

## Trust boundaries

- GitHub Actions is the sole Release mutator and signing authority.
- Release secrets remain in the protected environment and never enter local
  logs, task artifacts, command arguments, or the repository.
- Aggregate workflow and public artifacts are evidence; a tag push, local
  build, or partial matrix is not a successful release.
- A failed immutable tag is never moved. Any failure after tag creation is
  recorded truthfully and resolved with a new patch release.

## Local replacement

Download the public Apple Silicon DMG to a temporary directory, verify its
checksum and Apple trust chain before mounting, then verify the mounted app.
Quit Cutout, move the existing installed bundle to a version-qualified Trash
path, copy the verified app to `/Applications`, detach the DMG, launch, and
verify the running executable path. User data and credentials remain outside
the app bundle and are not removed.
