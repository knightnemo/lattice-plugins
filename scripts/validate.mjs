// Validates every entry and blocked.json. With --base <ref>, also checks that a changed
// entry moves its version forward and flags changes that need a human reviewer.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  ROOT,
  checkBlocked,
  checkEntryShape,
  checkTheme,
  compareVersions,
  fetchThemeFile,
  listThemeDirs,
  makeThemeValidator,
  readJson,
} from "./lib.mjs";

const baseIndex = process.argv.indexOf("--base");
const baseRef = baseIndex === -1 ? "" : process.argv[baseIndex + 1] ?? "";

function readAtBase(file) {
  if (!baseRef) return undefined;
  try {
    return JSON.parse(execFileSync("git", ["show", `${baseRef}:${file}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return undefined;
  }
}

const validate = makeThemeValidator();
const report = [];
let failed = false;

const { ids, stray } = listThemeDirs();
for (const file of stray) {
  failed = true;
  report.push(`FAIL ${file}: only themes/<id>/entry.json belongs under themes/`);
}

for (const id of ids) {
  const file = `themes/${id}/entry.json`;
  const errors = [];
  const notes = [];
  let entry;
  if (!existsSync(path.join(ROOT, file))) {
    errors.push("missing entry.json");
  } else {
    try {
      entry = readJson(path.join(ROOT, file));
    } catch (error) {
      errors.push(`entry.json is not valid JSON: ${error.message}`);
    }
  }
  if (entry) errors.push(...checkEntryShape(entry, id));
  if (entry && !errors.length) {
    const fetched = fetchThemeFile(entry);
    errors.push(...fetched.errors);
    if (fetched.data) errors.push(...checkTheme(fetched.data, entry, validate).errors);
    const previous = readAtBase(file);
    if (baseRef && !previous) {
      notes.push("new theme: needs a human review (first submission)");
    } else if (previous && (previous.commit !== entry.commit || previous.sha256 !== entry.sha256 || previous.version !== entry.version)) {
      if (compareVersions(entry.version, previous.version) <= 0) {
        errors.push(`version ${entry.version} must be greater than the published ${previous.version}`);
      }
      if (previous.repository !== entry.repository) notes.push("repository changed: needs a human review");
      else notes.push("update: may merge after green CI and the 24-hour cooling period");
    }
  }
  if (errors.length) failed = true;
  report.push(`${errors.length ? "FAIL" : "ok  "} ${file}`);
  for (const error of errors) report.push(`     - ${error}`);
  for (const note of notes) report.push(`     note: ${note}`);
}

const blockedErrors = checkBlocked(readJson(path.join(ROOT, "blocked.json")));
if (blockedErrors.length) failed = true;
report.push(`${blockedErrors.length ? "FAIL" : "ok  "} blocked.json`);
for (const error of blockedErrors) report.push(`     - ${error}`);

const text = report.join("\n");
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Registry validation\n\n\`\`\`\n${text}\n\`\`\`\n`);
}
if (failed) {
  console.error("\nValidation failed.");
  process.exit(1);
}
