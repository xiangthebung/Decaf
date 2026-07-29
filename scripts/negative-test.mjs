/**
 * Proves the build's reference check actually fails.
 *
 * `verifyReferences` is the only thing standing between a hand-written allowlist
 * and a shipped extension with a missing file, and a guard that has never been
 * seen to fail is a guard nobody should trust. Decaf's case is worse than most:
 * eight of its twelve icons are named only inside a JavaScript object literal that
 * `chrome.action.setIcon` reads, so nothing in the manifest or the HTML points at
 * them and a wrong allowlist would produce a toolbar icon that silently stops
 * changing state.
 *
 * This drops one of those icons out of the allowlist, runs the build, and expects
 * it to fail naming the file and the referrer. It restores the file either way.
 *
 *   node scripts/negative-test.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(here, "build.mjs");
const VICTIM = "icons/icon-off32.png";

const original = await readFile(buildScript, "utf8");
const withoutVictim = original.replace(new RegExp(`^\\s*'${VICTIM}',\\r?\\n`, "m"), "");

if (withoutVictim === original) {
  console.error(`negative test: could not find '${VICTIM}' in RUNTIME_FILES`);
  process.exit(1);
}

let failed = false;
let output = "";
try {
  await writeFile(buildScript, withoutVictim, "utf8");
  const run = spawnSync(process.execPath, [buildScript], { encoding: "utf8" });
  output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  failed = run.status !== 0;
} finally {
  await writeFile(buildScript, original, "utf8");
}

const namesFile = output.includes(VICTIM);
const namesReferrer = output.includes("background.js");

if (failed && namesFile && namesReferrer) {
  console.log(`negative test passed: dropping ${VICTIM} fails the build, and it says why`);
  console.log(
    output
      .trim()
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n"),
  );
} else {
  console.error("negative test FAILED — the reference check did not catch a missing icon");
  console.error(`  build failed: ${failed}`);
  console.error(`  names the file: ${namesFile}`);
  console.error(`  names the referrer: ${namesReferrer}`);
  console.error(output);
  process.exit(1);
}
