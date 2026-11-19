# Reviewing an entry

CI does the mechanical half on every pull request (`scripts/validate.mjs`). A maintainer
(today, leo1oel) does the rest with this list, and writes the answers in the pull request
before merging.

## Which changes need a human

- every first submission of a theme or plugin;
- an update that changes the repository or owner;
- for plugins, an update whose permissions grow (CI prints `permissions grew` with the
  new ones) or whose runtime changes.

Other updates merge after green CI and a 24-hour cooling period, during which any
maintainer can hold them.

## Every entry

1. **Is the id or name impersonating someone?** No "Lattice" or "Overleaf" names without
   permission, no confusable ids. `app.lattice.*` is Lattice's own: themes bundled with
   the app, and plugins whose source is in leo1oel/lattice (CI enforces both).
2. **Is the description accurate, the licence present, and the repository real and
   public?** A port credits the original author and keeps its licence.

## Themes

3. **Is it readable?** Lattice lifts text to 4.5:1 on every surface, but a theme that only
   works after heavy lifting will look wrong; reject it.
4. **Does it stay data?** No fonts, no images in the theme file, nothing outside the
   schema.

## Plugins

Read the source at the pinned commit (the entry's `repository`/`tree`/`tag`/`path`; CI
proves the zip Lattice installs is that folder packed).

3. **Do the permissions fit the stated purpose?** CI prints what the plugin asks for. Every
   `network` origin and `network-local` port is named in the plugin's README with the
   reason; every `secrets` name says what the secret is for.
4. **Does it send project content off the machine?** If it does, the README and the
   description say so in plain words (for example "sends the selected text to
   api.example.org").
5. **Is the source readable, with no fetching and running remote code?** CI rejects
   `eval`, `new Function`, `vm` and lines over 1000 characters; also look for a fetched
   script passed to anything that runs it, and for dependencies that aren't vendored as
   readable source.
6. **Does it duplicate a built-in feature in a misleading way?**
