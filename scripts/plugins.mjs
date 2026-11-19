// Plugin entries: plugins/<id>/entry.json pins a tag and commit of the plugin's source,
// the folder inside that repository, and the sha256 of the folder packed by pack.mjs.
// The registry packs the folder itself and serves that zip; it never hosts or trusts an
// author-built archive. Lattice checks the manifest inside against the index again
// before it installs (lattice-core registry.rs, install_plugin).
import { parse as parseToml } from "smol-toml";
import { ID_PATTERN, REPOSITORY_PATTERN, TAG_PATTERN, VERSION_PATTERN, sha256, withTaggedCommit } from "./lib.mjs";
import { packFiles, packed } from "./pack.mjs";

// lattice-core plugins/store.rs: what Lattice unpacks at most.
const MAX_ARCHIVE = 50 << 20;
const MAX_UNPACKED = 200 << 20;
const MAX_FILES = 10_000;
// lattice-core plugins/protocol.rs: the plugin API levels this registry lists.
export const API_LEVEL = 1;

const ENTRY_KEYS = ["id", "version", "repository", "tag", "commit", "path", "sha256", "author", "categories"];
const FOLDER_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._\/-]*$/;
const CATEGORY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
// lattice-core plugins/manifest.rs ACCEPTED_LICENSES.
const LICENSES = new Set([
  "0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "BSL-1.0", "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later", "ISC",
  "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later", "MIT", "MPL-2.0", "Unlicense", "Zlib",
]);
const MANIFEST_KEYS = new Set(["schema", "id", "name", "version", "api", "license", "description", "repository", "runtime", "main", "targets", "permissions", "commands"]);
const PERMISSION_KEYS = new Set(["project-read", "network-local", "network", "secrets"]);
// ProjectRead's declaration order in lattice-core, which its permissions() sorts by.
const PROJECT_READ = ["context", "bibliography"];
const NAME_PATTERN = /^[a-z0-9-]{1,40}$/;
// Readable source only: a line this long is minified or generated code.
const MAX_LINE = 1000;
const SCRIPT = /\.(m?js|cjs)$/;

export function checkPluginEntryShape(entry, dirId) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return ["entry.json must be a JSON object"];
  const errors = [];
  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.includes(key)) errors.push(`unknown key "${key}"`);
  }
  for (const key of ENTRY_KEYS.filter((key) => key !== "categories")) {
    if (typeof entry[key] !== "string") errors.push(`"${key}" must be a string`);
  }
  if (!Array.isArray(entry.categories)) errors.push('"categories" must be an array');
  if (errors.length) return errors;
  if (entry.id !== dirId) errors.push(`id "${entry.id}" must match its folder "${dirId}"`);
  if (!ID_PATTERN.test(entry.id) || entry.id.length > 100) errors.push("id must be reverse-domain, lower case, at most 100 characters");
  // Lattice's own plugins live in its repository; nobody else may publish under its name.
  if (entry.id.startsWith("app.lattice.") && entry.repository !== "https://github.com/leo1oel/lattice") {
    errors.push("ids under app.lattice.* belong to the plugins in leo1oel/lattice");
  }
  if (!VERSION_PATTERN.test(entry.version)) errors.push("version must be semver (1.2.3)");
  if (!REPOSITORY_PATTERN.test(entry.repository)) errors.push("repository must be https://github.com/<owner>/<repo>");
  if (!TAG_PATTERN.test(entry.tag) || entry.tag.includes("..")) errors.push("tag has characters the registry does not accept");
  if (!/^[0-9a-f]{40}$/.test(entry.commit)) errors.push("commit must be a full 40-character lower-case sha");
  if (entry.path !== "." && (!FOLDER_PATTERN.test(entry.path) || entry.path.endsWith("/") || entry.path.split("/").some((part) => part === "." || part === ".."))) {
    errors.push('path must be the plugin folder relative to the repository root, or "."');
  }
  if (!/^[0-9a-f]{64}$/.test(entry.sha256)) errors.push("sha256 must be 64 lower-case hex characters");
  if (!entry.author.trim() || entry.author.length > 64) errors.push("author must be 1 to 64 characters");
  if (entry.categories.length > 4 || !entry.categories.every((c) => typeof c === "string" && CATEGORY_PATTERN.test(c))) {
    errors.push("categories lists at most 4 lower-case words (citations, bibliography, writing, …)");
  }
  return errors;
}

// The packed files of the entry's folder at its commit, read from git's object store, and
// the commit's date. Symlinks and submodules are refused; tests and dot files are left
// out exactly as pack-plugin.mjs leaves them out.
export function fetchPluginFiles(entry) {
  return withTaggedCommit(entry, MAX_UNPACKED + (1 << 20), (git) => {
    const prefix = entry.path === "." ? "" : `${entry.path}/`;
    const listing = git(["ls-tree", "-r", "-l", "-z", "--full-tree", entry.commit, "--", entry.path === "." ? "." : entry.path]);
    const files = [];
    const errors = [];
    let total = 0;
    for (const line of listing.split("\0").filter(Boolean)) {
      const tab = line.indexOf("\t");
      const [mode, type, blob, size] = line.slice(0, tab).split(/\s+/);
      const full = line.slice(tab + 1);
      if (!full.startsWith(prefix)) continue;
      const relative = full.slice(prefix.length);
      if (!packed(relative)) continue;
      if (type !== "blob" || (mode !== "100644" && mode !== "100755")) {
        errors.push(`${full} must be a regular file (git mode ${mode} ${type})`);
        continue;
      }
      total += Number(size);
      files.push({ path: relative, blob, executable: mode === "100755" });
    }
    if (!files.length) errors.push(`${entry.path} has no files at ${entry.commit}`);
    if (files.length > MAX_FILES) errors.push(`${files.length} files; Lattice unpacks at most ${MAX_FILES}`);
    if (total > MAX_UNPACKED) errors.push(`${total} bytes unpacked; Lattice unpacks at most ${MAX_UNPACKED}`);
    if (errors.length) return { errors };
    for (const file of files) file.data = git(["cat-file", "blob", file.blob], "buffer");
    const updated = new Date(git(["show", "-s", "--format=%cI", entry.commit]).trim()).toISOString();
    return { files: files.map(({ path, data, executable }) => ({ path, data, executable })), updated, errors: [] };
  });
}

const unique = (list) => new Set(list).size === list.length;

// The manifest's permissions in the index's shape, ordered as lattice-core's
// Manifest::permissions() orders them, since Lattice compares the two with ==.
export function indexPermissions(manifest) {
  const p = manifest.permissions ?? {};
  return {
    projectRead: [...(p["project-read"] ?? [])].sort((a, b) => PROJECT_READ.indexOf(a) - PROJECT_READ.indexOf(b)),
    networkLocal: [...(p["network-local"] ?? [])].sort((a, b) => a - b),
    network: (p.network ?? []).map((origin) => new URL(origin).origin).sort(),
    secrets: [...(p.secrets ?? [])].sort(),
  };
}

function checkPermissions(p, errors) {
  if (p === undefined) return;
  if (!p || typeof p !== "object" || Array.isArray(p)) return errors.push("[permissions] must be a table");
  for (const key of Object.keys(p)) if (!PERMISSION_KEYS.has(key)) errors.push(`unknown permission "${key}"`);
  const list = (key) => p[key] === undefined || (Array.isArray(p[key]) && unique(p[key]));
  const malformed = [...PERMISSION_KEYS].filter((key) => !list(key));
  for (const key of malformed) errors.push(`${key} must be a list without repeats`);
  if (malformed.length) return;
  for (const read of p["project-read"] ?? []) {
    if (!PROJECT_READ.includes(read)) errors.push(`project-read "${read}" is not one API level 1 grants (context, bibliography)`);
  }
  const ports = p["network-local"] ?? [];
  if (ports.length > 8 || !ports.every((port) => Number.isInteger(port) && port >= 1 && port <= 65535)) {
    errors.push("network-local lists at most 8 ports, each 1 to 65535");
  }
  const origins = p.network ?? [];
  if (origins.length > 16) errors.push("network lists at most 16 origins");
  for (const origin of origins) {
    let url;
    try {
      url = new URL(origin);
    } catch {}
    const bare = url && url.pathname === "/" && !url.search && !url.hash && !url.username && !origin.endsWith("/");
    if (!bare || url.protocol !== "https:") errors.push(`network origin "${origin}" must be https://host[:port] with no path`);
  }
  const secrets = p.secrets ?? [];
  if (secrets.length > 8 || !secrets.every((name) => typeof name === "string" && NAME_PATTERN.test(name))) {
    errors.push("secrets lists at most 8 names of lower-case letters, digits and dashes");
  }
}

const text = (value, max) => typeof value === "string" && value.trim() !== "" && [...value].length <= max && !/[\u0000-\u001f\u007f]/.test(value);

// Packs the files, checks the hash, the manifest (as lattice-core validates it, and the
// registry's stricter rules: node only, an accepted licence, a README and a licence file)
// and that every script reads as source. Returns the manifest and the zip.
export function checkPlugin(files, entry) {
  const errors = [];
  const zip = packFiles(files);
  if (zip.length > MAX_ARCHIVE) errors.push(`the pack is ${zip.length} bytes; Lattice installs at most ${MAX_ARCHIVE}`);
  const actual = sha256(zip);
  if (actual !== entry.sha256) {
    errors.push(`sha256 mismatch: the entry says ${entry.sha256}, the pack of ${entry.path} at ${entry.commit} is ${actual} (pack it with Lattice's plugin-sdk/scripts/pack-plugin.mjs)`);
  }
  const byPath = new Map(files.map((file) => [file.path, file]));
  const manifestFile = byPath.get("lattice-plugin.toml");
  if (!manifestFile) return { errors: [...errors, "lattice-plugin.toml is missing from the folder"] };
  let manifest;
  try {
    manifest = parseToml(manifestFile.data.toString("utf8"));
  } catch (error) {
    return { errors: [...errors, `lattice-plugin.toml is not valid TOML: ${error.message}`] };
  }
  for (const key of Object.keys(manifest)) if (!MANIFEST_KEYS.has(key)) errors.push(`lattice-plugin.toml: unknown key "${key}"`);
  if (manifest.schema !== 1) errors.push("lattice-plugin.toml: schema must be 1");
  if (manifest.id !== entry.id) errors.push(`manifest id "${manifest.id}" does not match the entry id "${entry.id}"`);
  if (manifest.version !== entry.version) errors.push(`manifest version "${manifest.version}" does not match the entry version "${entry.version}"`);
  if (!Number.isInteger(manifest.api) || manifest.api < 1 || manifest.api > API_LEVEL) errors.push(`api must be 1 to ${API_LEVEL}`);
  if (!text(manifest.name, 80)) errors.push("name must be 1 to 80 characters of text");
  if (!text(manifest.description, 500)) errors.push("description is required, 1 to 500 characters of text");
  if (!LICENSES.has(manifest.license)) errors.push(`license "${manifest.license}" is not one Lattice accepts (${[...LICENSES].join(", ")})`);
  if (manifest.repository !== undefined && !(typeof manifest.repository === "string" && manifest.repository.startsWith("https://"))) {
    errors.push("repository must be an https URL");
  }
  // Native plugins stay URL installs (Captain plan L4); the registry lists node plugins.
  if (manifest.runtime !== "node") errors.push('runtime must be "node": the registry lists node plugins only');
  if (manifest.targets !== undefined) errors.push("targets belongs to exec plugins, which the registry does not list");
  if (typeof manifest.main !== "string" || !byPath.has(manifest.main)) errors.push(`main "${manifest.main}" must name a packed file`);
  checkPermissions(manifest.permissions, errors);
  const commands = Array.isArray(manifest.commands) ? manifest.commands : [];
  if (commands.length < 1 || commands.length > 32) errors.push("a plugin declares between 1 and 32 commands");
  const ids = commands.map((command) => command?.id);
  if (!ids.every((id) => typeof id === "string" && NAME_PATTERN.test(id)) || !unique(ids)) errors.push("command ids must be unique names of lower-case letters, digits and dashes");
  if (!commands.every((command) => text(command?.title, 80))) errors.push("every command needs a title of 1 to 80 characters");
  if (!commands.every((command) => command?.description === undefined || text(command.description, 500))) errors.push("a command description must be 1 to 500 characters of text");
  if (!files.some((file) => /^readme(\.md)?$/i.test(file.path))) errors.push("README.md is missing: it must say what the plugin reaches and why");
  if (!files.some((file) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(file.path))) errors.push("a LICENSE file is missing");
  for (const file of files.filter((file) => SCRIPT.test(file.path))) {
    const source = file.data.toString("utf8");
    const long = source.split("\n").findIndex((line) => line.length > MAX_LINE);
    if (long !== -1) errors.push(`${file.path}:${long + 1} is over ${MAX_LINE} characters: the registry lists readable source, not minified code`);
    if (/\beval\s*\(|\bnew\s+Function\s*\(|\bvm\.(runIn|Script|compileFunction)/.test(source)) {
      errors.push(`${file.path} evaluates code at run time (eval, new Function or vm): not allowed`);
    }
  }
  return { manifest, zip, errors };
}

// What `next` asks for that `previous` did not, as lines for the reviewer.
export function permissionGrowth(previous, next) {
  const grown = [];
  for (const [key, label] of [["projectRead", "project-read"], ["networkLocal", "network-local"], ["network", "network"], ["secrets", "secrets"]]) {
    const added = next[key].filter((value) => !previous[key].includes(value));
    if (added.length) grown.push(`new ${label}: ${added.join(", ")}`);
  }
  return grown;
}

// The index's listing of one plugin version (lattice-core registry.rs IndexPlugin).
export function indexPlugin(entry, manifest, zip, updated, url) {
  return {
    id: entry.id,
    name: manifest.name,
    version: manifest.version,
    api: manifest.api,
    runtime: manifest.runtime,
    license: manifest.license,
    author: entry.author,
    description: manifest.description,
    repository: entry.path === "." ? `${entry.repository}/tree/${entry.tag}` : `${entry.repository}/tree/${entry.tag}/${entry.path}`,
    commit: entry.commit,
    categories: entry.categories,
    permissions: indexPermissions(manifest),
    commands: manifest.commands.map((command) => ({ id: command.id, title: command.title, description: command.description ?? null })),
    url,
    sha256: sha256(zip),
    size: zip.length,
    downloads: null,
    updated,
  };
}
