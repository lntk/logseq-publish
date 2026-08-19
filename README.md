# logseq-publish

A minimal one-page publisher for Logseq Markdown using GitHub Pages.

## Everyday publishing

1. Export the Logseq page as Markdown.
2. Rename the exported file to `page.md`.
3. Open this repository on GitHub and choose **Add file → Upload files** (or drag the file into the browser).
4. Drop in `page.md` and commit the change.

The same GitHub Pages URL updates automatically after GitHub redeploys the site.

## One-time setup

In **Settings → Pages**:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**

Then the site will normally be available at:

`https://lntk.github.io/logseq-publish/`

## Notes

- The publisher renders standard GitHub-flavored Markdown.
- Common Logseq `TODO`, `DOING`, `DONE`, and `[[page refs]]` receive lightweight normalization.
- Local Logseq image/file paths are not uploaded automatically. Remote image URLs work; local assets must be uploaded separately if needed.
