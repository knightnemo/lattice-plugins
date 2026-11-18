# Lattice plugins and themes registry

This repository is the registry behind Settings › Appearance › Themes (and, later,
Settings › Plugins) in [Lattice](https://github.com/leo1oel/lattice). Authors add an
entry by pull request. CI checks every entry against the exact commit it pins, and on
every merge to `main` a workflow builds a signed `index.json` and publishes it, with the
theme files and the kill switch, to GitHub Pages:

| File | URL |
|---|---|
| Index | https://leo1oel.github.io/lattice-plugins/index.json |
| Index signature | https://leo1oel.github.io/lattice-plugins/index.json.minisig |
| Kill switch | https://leo1oel.github.io/lattice-plugins/blocked.json |
| Kill switch signature | https://leo1oel.github.io/lattice-plugins/blocked.json.minisig |
| Theme schema | https://leo1oel.github.io/lattice-plugins/schema/theme-1.json |

Lattice verifies both signatures against public keys compiled into the app
([`keys/primary.pub`](keys/primary.pub), with [`keys/backup.pub`](keys/backup.pub) held
back for rotation) and checks each theme file's sha256 against the index before it
installs it. A compromised CDN or GitHub account can't inject a theme without the
signing key.

Themes are data only: one JSON file that gives colors to Lattice's design roles. They
can't run code or bundle fonts, so installing one asks for no permission and works on
every platform. The format is documented in Lattice's
[`docs/themes.md`](https://github.com/leo1oel/lattice/blob/main/docs/themes.md) and
[`schema/theme-1.json`](schema/theme-1.json).

## Submitting a theme

1. Keep your theme in a public GitHub repository as a `*.lattice-theme.json` file,
   at most 256 KiB, that validates against
   `https://leo1oel.github.io/lattice-plugins/schema/theme-1.json`. Pick a reverse-domain
   `id` you own (for example `io.github.<you>.<theme>`); `app.lattice.*` is reserved for
   the themes bundled with Lattice. Include a licence.
2. Tag the commit you want listed and push the tag.
3. Add `themes/<id>/entry.json` here in a pull request:

   ```json
   {
     "id": "io.github.leo1oel.harbor",
     "version": "1.0.0",
     "repository": "https://github.com/leo1oel/lattice-plugins",
     "tag": "examples/harbor-v1.0.0",
     "commit": "<the full 40-character sha the tag points at>",
     "path": "examples/harbor.lattice-theme.json",
     "sha256": "<shasum -a 256 harbor.lattice-theme.json>"
   }
   ```

   `id` and `version` must equal the theme file's own. The folder name must equal `id`.
4. Fill in the checklist in the pull request template.

To update a theme, tag a new commit, raise `version` in the theme file, and change
`version`, `tag`, `commit` and `sha256` in your entry. Versions only go up.

### What CI checks on every pull request

For each entry, [`scripts/validate.mjs`](scripts/validate.mjs):

- fetches only the pinned tag from the source repository and requires it to point at
  `commit`;
- reads the file at `path` out of that commit (a regular file, not a symlink) and
  rejects it if it is over 256 KiB;
- checks its sha256 against the entry;
- validates it against `schema/theme-1.json`, and checks that its `id` and `version`
  match the entry and that variant ids are unique;
- on an update, checks that `version` is greater than the one on `main`, and flags a
  change of repository for a human;
- validates `blocked.json`.

## Review rules

CI does the mechanical half. A maintainer (today, leo1oel) reviews:

- **every first submission**;
- **any update that changes the repository or owner** (and, for plugins, any update
  whose permissions grow or whose runtime changes).

Other updates merge after green CI and a 24-hour cooling period, during which any
maintainer can hold them.

The reviewer asks:

1. Is the id or name impersonating someone? No "Lattice" or "Overleaf" names without
   permission, no confusable ids.
2. Is the description accurate, the licence present, and the repository real and
   public? Ported palettes credit the original author and keep its licence.
3. Is the theme readable? Lattice lifts text to 4.5:1 on every surface, but a theme
   that only works after heavy lifting will look wrong; reject it.
4. Does it stay data? No fonts, no images in the theme file, nothing outside the schema.

### Plugins (later)

Plugin entries (`plugins/<id>/entry.json`) arrive in a later phase. They will pin a
release asset by sha256 and CI will reproduce it from the tagged source. Their review
adds: do the permissions fit the stated purpose, with every network origin and local
port named in the README; does the plugin send project content off the machine, and
say so plainly if it does; is the source readable, with no fetching and running remote
code; does it duplicate a built-in feature in a misleading way.

## The kill switch

[`blocked.json`](blocked.json) lists versions Lattice must turn off. It is signed and
published with the index:

```json
[
  {
    "id": "dev.bad.plugin",
    "versions": "<=0.3.1",
    "action": "disable",
    "reason": "Sent bibliography contents to an undeclared server.",
    "url": "https://github.com/leo1oel/lattice-plugins/issues/123"
  }
]
```

- `versions` is a semver range, or `"*"` for all.
- `action` is `"disable"` (turned off and can't be turned back on) or `"warn"` (a
  banner; it keeps working).
- Lattice never deletes the files or the data folder. Removing an entry from `themes/`
  only stops new installs; existing installs keep working unless they are also blocked.
- Folder (developer) installs are never touched by the block list.

To block something, open a pull request that adds an item to `blocked.json`. It is
published on the next signed run like any other change.

## Published formats

`index.json`:

```json
{
  "format": 1,
  "serial": 7,
  "generated": "2026-11-18T12:00:00.000Z",
  "themes": [
    {
      "id": "io.github.leo1oel.harbor",
      "name": "Harbor",
      "version": "1.0.0",
      "author": "leo1oel",
      "license": "MIT",
      "description": "…",
      "repository": "https://github.com/leo1oel/lattice-plugins",
      "tag": "examples/harbor-v1.0.0",
      "commit": "…",
      "path": "examples/harbor.lattice-theme.json",
      "url": "https://leo1oel.github.io/lattice-plugins/themes/io.github.leo1oel.harbor/1.0.0.lattice-theme.json",
      "sha256": "…",
      "size": 2052,
      "variants": [
        { "id": "day", "name": "Harbor Day", "appearance": "light", "colors": { "window": "#f4f6f8", "…": "…" } }
      ]
    }
  ],
  "plugins": []
}
```

- `serial` goes up by at least one on every publish. Clients keep the highest serial
  they have verified and refuse a lower one, so an old signed index can't be replayed.
- `generated` is the build time (ISO 8601, UTC), for display.
- `variants[].colors` is each variant's base colors as the theme gives them, for preview
  swatches. Roles a theme leaves out are absent; the app fills them from its own palette.
- `url` serves the exact bytes the `sha256` covers.

`blocked.json` is `{ "format": 1, "serial", "generated", "blocked": [ … ] }` with the
same serial as the index it was published with.

Each `.minisig` is a minisign (Ed25519) signature whose trusted comment is
`lattice-plugins file:<name> serial:<serial>`. Verify by hand:

```sh
minisign -V -p keys/primary.pub -m index.json -x index.json.minisig
```

## Signing

Only the `sign` job in [`publish.yml`](.github/workflows/publish.yml) can read the
signing key. It runs in the `registry-signing` environment, which accepts deployments
only from `main` and waits for leo1oel's approval on every run. The private keys exist
only as secrets of that environment: `MINISIGN_PRIMARY_SECRET_KEY` signs,
`MINISIGN_BACKUP_SECRET_KEY` is kept for rotation.

To rotate: ship a Lattice release that trusts the backup key (it already does), switch
the sign step to `MINISIGN_BACKUP_SECRET_KEY`, generate a new backup pair, and ship a
release that trusts the new backup before retiring the old primary.

## Layout

```
themes/<id>/entry.json      one entry per theme
blocked.json                kill switch
schema/theme-1.json         theme JSON Schema (copied from leo1oel/lattice)
keys/primary.pub            public key that signs the index
keys/backup.pub             rotation key
examples/                   themes hosted here to seed the registry
scripts/                    validate and build-index
.github/workflows/          validate on PR; build, sign and publish on main
```

Run the checks locally with `npm ci && npm run validate`.
