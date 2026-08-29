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
 * it to fail naming the file and the referrer.
 *
 *   node scripts/negative-test.mjs
 *
 * Two things it is careful about, both learned the hard way.
 *
 * It builds into a throwaway directory rather than dist/. The point of this test is
 * to assemble a *broken* extension, and a build deletes whatever its output holds
 * that RUNTIME_FILES no longer names — so aimed at dist/, this left the working
 * build missing exactly the icon it had just removed, and nothing put it back. That
 * was true when the build emptied its output wholesale and it is still true now
 * that it only prunes, because the dropped icon is precisely what gets pruned.
 * `node --test` discovers this
 * file on its own (the name matches its patterns), so every `npm test` quietly
 * corrupted dist/: the artifact `npm run zip` packages, the one the README tells
 * people to load, and the one the browser tests run against. The symptom was the
 * failure this test exists to warn about — a toolbar that stops reporting whether
 * Decaf is on — reintroduced by the test itself.
 *
 * And it edits a *copy* of the build script rather than the script. Editing the
 * real one meant that for as long as the child build ran, the repository held a
 * knowingly wrong build script: killed at the wrong moment, or run beside
 * anything else that read it, and the damage outlived the test.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
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

/*
 * The copy has to live beside the original: build.mjs finds the repository by
 * walking up from its own location, and imports ./zip.mjs relative to itself.
 * A leading dot keeps it out of the way if it is ever left behind.
 */
const copyScript = path.join(here, ".build-negative.mjs");
let out = "";
let failed = false;
let output = "";

try {
  out = await mkdtemp(path.join(os.tmpdir(), "decaf-negative-"));
  await writeFile(copyScript, withoutVictim, "utf8");
  const run = spawnSync(process.execPath, [copyScript, `--out=${out}`], { encoding: "utf8" });
  output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  failed = run.status !== 0;
} finally {
  await rm(copyScript, { force: true });
  if (out) await rm(out, { recursive: true, force: true });
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
