<!-- One entry per pull request. See README.md for the format and REVIEW.md for the review. -->

## What this adds or changes

- Entry: `themes/<id>/entry.json` or `plugins/<id>/entry.json`
- New theme or plugin / update from version … to …

## Checklist

- [ ] The entry pins a tag in a public GitHub repository and the full commit sha it points at; the folder name equals `id`.
- [ ] For an update: `version` is greater than the published one, and the repository or owner is unchanged (otherwise say why below; it needs a human review).
- [ ] The id is reverse-domain and mine, is not under `app.lattice.*` (unless the source is in leo1oel/lattice), and neither id nor name impersonates someone (no "Lattice" or "Overleaf" names without permission, no confusable ids).
- [ ] The description is accurate, the source repository has a licence, and a port credits its original author and keeps its licence.

### Themes

- [ ] `path` is the `.lattice-theme.json` and `sha256` is that file's; `id` and `version` equal the theme file's own.
- [ ] The theme is data only: one JSON file of at most 256 KiB that validates against `schema/theme-1.json`, with no fonts or images.
- [ ] I checked every variant in Lattice: text reads on every surface, and the accent and status colors are visible.

### Plugins

- [ ] `path` is the plugin folder, and `sha256` is what Lattice's `plugin-sdk/scripts/pack-plugin.mjs` printed for it at the tagged commit; `id` and `version` equal the manifest's own.
- [ ] It is a node plugin with readable source: nothing minified, no fetching and running remote code.
- [ ] The README names every `network` origin and `network-local` port with the reason, and every secret with what it is for.
- [ ] If the plugin sends project content off the machine, the README and the description say so plainly.
- [ ] I ran its commands in Lattice from a folder install.
