<!-- One entry per pull request. See README.md for the format and the review rules. -->

## What this adds or changes

- Entry: `themes/<id>/entry.json`
- New theme / update from version … to …

## Checklist

- [ ] The entry pins a tag in a public GitHub repository, the full commit sha it points at, the path to the `.lattice-theme.json`, and its sha256.
- [ ] `id` and `version` in the entry equal the theme file's own, and the folder name equals `id`.
- [ ] For an update: `version` is greater than the published one, and the repository or owner is unchanged (otherwise say why below; it needs a human review).
- [ ] The id is reverse-domain and mine, is not under `app.lattice.*`, and neither id nor name impersonates someone (no "Lattice" or "Overleaf" names without permission, no confusable ids).
- [ ] The description is accurate, the source repository has a licence, and a ported palette credits its original author and keeps its licence.
- [ ] The theme is data only: one JSON file of at most 256 KiB that validates against `schema/theme-1.json`, with no fonts or images.
- [ ] I checked every variant in Lattice: text reads on every surface, and the accent and status colors are visible.

<!--
Plugins (later phase) will also answer:
- Do the permissions fit the stated purpose? Is every network origin and local port named in the README with the reason?
- Does the plugin send project content off the machine? If so, do the README and the description say so plainly?
- Is the source readable, with no fetching and running remote code?
- Does it duplicate a built-in feature in a misleading way?
-->
