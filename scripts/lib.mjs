import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const MAX_THEME_BYTES = 256 * 1024;

const ENTRY_KEYS = ["id", "version", "repository", "tag", "commit", "path", "sha256"];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+([-+].*)?$/;
const REPOSITORY_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
// Tags go into a git refspec, so anything git or the shell could read as syntax is refused.
const TAG_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._\/-]{0,127}$/;
const PATH_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._\/-]*\.lattice-theme\.json$/;
const BLOCK_ACTIONS = new Set(["disable", "warn"]);

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function listThemeDirs() {
  const dir = path.join(ROOT, "themes");
  if (!existsSync(dir)) return { ids: [], stray: [] };
  const all = readdirSync(dir, { withFileTypes: true });
  return {
    ids: all.filter((d) => d.isDirectory()).map((d) => d.name).sort(),
    stray: all.filter((d) => !d.isDirectory() && d.name !== ".gitkeep").map((d) => `themes/${d.name}`),
  };
}

export function checkEntryShape(entry, dirId) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return ["entry.json must be a JSON object"];
  const errors = [];
  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.includes(key)) errors.push(`unknown key "${key}"`);
  }
  for (const key of ENTRY_KEYS) {
    if (typeof entry[key] !== "string") errors.push(`"${key}" must be a string`);
  }
  if (errors.length) return errors;
  if (entry.id !== dirId) errors.push(`id "${entry.id}" must match its folder "${dirId}"`);
  if (!ID_PATTERN.test(entry.id) || entry.id.length > 128) errors.push("id must be reverse-domain, lower case, at most 128 characters");
  if (entry.id.startsWith("app.lattice.")) errors.push("ids under app.lattice.* belong to the themes bundled with Lattice");
  if (!VERSION_PATTERN.test(entry.version)) errors.push("version must be semver (1.2.3)");
  if (!REPOSITORY_PATTERN.test(entry.repository)) errors.push("repository must be https://github.com/<owner>/<repo>");
  if (!TAG_PATTERN.test(entry.tag) || entry.tag.includes("..")) errors.push("tag has characters the registry does not accept");
  if (!/^[0-9a-f]{40}$/.test(entry.commit)) errors.push("commit must be a full 40-character lower-case sha");
  if (!PATH_PATTERN.test(entry.path) || entry.path.split("/").some((part) => part === "." || part === "..")) {
    errors.push("path must be a relative path ending in .lattice-theme.json");
  }
  if (!/^[0-9a-f]{64}$/.test(entry.sha256)) errors.push("sha256 must be 64 lower-case hex characters");
  return errors;
}

// Fetches only the tagged commit and reads the file out of git's object store, so what is
// checked is exactly the blob at that commit, never a working tree or a release asset.
export function fetchThemeFile(entry) {
  const dir = mkdtempSync(path.join(tmpdir(), "lattice-entry-"));
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  const git = (args, encoding = "utf8") =>
    execFileSync("git", args, { cwd: dir, env, encoding, maxBuffer: 4 * MAX_THEME_BYTES, stdio: ["ignore", "pipe", "pipe"] });
  try {
    git(["init", "--quiet"]);
    git(["remote", "add", "origin", entry.repository]);
    try {
      git(["fetch", "--quiet", "--depth=1", "--no-tags", "origin", `+refs/tags/${entry.tag}:refs/tags/${entry.tag}`]);
    } catch (error) {
      return { errors: [`could not fetch tag "${entry.tag}" from ${entry.repository}: ${String(error.stderr ?? error.message).trim()}`] };
    }
    const tagCommit = git(["rev-parse", "--verify", `refs/tags/${entry.tag}^{commit}`]).trim();
    if (tagCommit !== entry.commit) {
      return { errors: [`tag "${entry.tag}" points at ${tagCommit}, but the entry pins ${entry.commit}`] };
    }
    const listing = git(["ls-tree", "-l", entry.commit, "--", entry.path]).trim();
    if (!listing) return { errors: [`${entry.path} does not exist at ${entry.commit}`] };
    const [meta] = listing.split("\t");
    const [mode, type, blob, size] = meta.split(/\s+/);
    if (type !== "blob" || (mode !== "100644" && mode !== "100755")) {
      return { errors: [`${entry.path} must be a regular file (git mode ${mode} ${type})`] };
    }
    if (Number(size) > MAX_THEME_BYTES) {
      return { errors: [`${entry.path} is ${size} bytes; themes are at most ${MAX_THEME_BYTES} bytes (256 KiB)`] };
    }
    return { data: git(["cat-file", "blob", blob], "buffer"), errors: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function makeThemeValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  return ajv.compile(readJson(path.join(ROOT, "schema", "theme-1.json")));
}

export function checkTheme(data, entry, validate) {
  const errors = [];
  if (data.length > MAX_THEME_BYTES) errors.push(`theme file is ${data.length} bytes; the limit is ${MAX_THEME_BYTES}`);
  const actual = sha256(data);
  if (actual !== entry.sha256) errors.push(`sha256 mismatch: the entry says ${entry.sha256}, the file at ${entry.commit} is ${actual}`);
  let theme;
  try {
    theme = JSON.parse(data.toString("utf8"));
  } catch (error) {
    errors.push(`theme file is not valid JSON: ${error.message}`);
    return { errors };
  }
  if (!validate(theme)) {
    for (const issue of validate.errors) errors.push(`schema: ${issue.instancePath || "/"} ${issue.message}`);
    return { errors };
  }
  if (theme.id !== entry.id) errors.push(`theme id "${theme.id}" does not match the entry id "${entry.id}"`);
  if (theme.version !== entry.version) errors.push(`theme version "${theme.version}" does not match the entry version "${entry.version}"`);
  const variantIds = theme.variants.map((variant) => variant.id);
  if (new Set(variantIds).size !== variantIds.length) errors.push("variant ids must be unique");
  return { theme, errors };
}

export function checkBlocked(list) {
  if (!Array.isArray(list)) return ["blocked.json must be a JSON array"];
  const errors = [];
  list.forEach((item, index) => {
    const where = `blocked.json[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return errors.push(`${where} must be an object`);
    for (const key of Object.keys(item)) {
      if (!["id", "versions", "action", "reason", "url"].includes(key)) errors.push(`${where}: unknown key "${key}"`);
    }
    if (typeof item.id !== "string" || !ID_PATTERN.test(item.id)) errors.push(`${where}: id must be a registry id`);
    if (typeof item.versions !== "string" || !/^(\*|[0-9A-Za-z.+\-<>=^~| ]+)$/.test(item.versions)) {
      errors.push(`${where}: versions must be "*" or a semver range`);
    }
    if (!BLOCK_ACTIONS.has(item.action)) errors.push(`${where}: action must be "disable" or "warn"`);
    if (typeof item.reason !== "string" || !item.reason.trim()) errors.push(`${where}: reason is required`);
    if (item.url !== undefined && (typeof item.url !== "string" || !item.url.startsWith("https://"))) {
      errors.push(`${where}: url must be an https URL`);
    }
  });
  return errors;
}

// Core semver precedence only: numeric major.minor.patch, then a pre-release sorts below its release.
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre = ""] = v.split("+")[0].split(/-(.*)/s);
    return { nums: core.split(".").map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}
