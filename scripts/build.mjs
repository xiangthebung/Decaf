/**
 * Build pipeline for the Decaf extension.
 *
 *   node scripts/build.mjs              assemble a loadable extension in dist/
 *   node scripts/build.mjs --watch      reassemble whenever a source file changes
 *   node scripts/build.mjs --zip        build, then write artifacts/decaf-<version>.zip
 *   node scripts/build.mjs --clean-only remove dist/ and artifacts/
 *   node scripts/build.mjs --out=DIR    assemble somewhere other than dist/
 *
 * `--out` exists for scripts/negative-test.mjs, which proves the reference check
 * below really fails by assembling a deliberately incomplete extension. Pointed at
 * dist/ that left the working build broken behind it — see the note in that file.
 *
 * Decaf ships plain ES modules with no dependencies, so there is nothing to
 * transpile or bundle: this "build" is a copy. It exists anyway, for two reasons.
 *
 * 1. Consistency. Every extension in this workspace is now loaded the same way —
 *    `npm run build`, then point `chrome://extensions` at `dist/`. It used to be
 *    "root for this one, dist/ for that one, and run a build first for the third",
 *    which is a thing you have to remember instead of a thing you know.
 *
 * 2. The store artifact stops drifting. The old zip was assembled by hand and
 *    thirteen of its twenty-two entries had fallen behind the working tree,
 *    including popup.js and background.js. `npm run zip` now packages the exact
 *    dist/ that was just assembled, so the artifact cannot disagree with source.
 *
 * The copy is an explicit allowlist rather than a glob, so tests, docs, store
 * assets and this script are never shipped. To stop that list from silently
 * falling behind, `verifyReferences()` reads the manifest, the HTML and the JS
 * back out of dist/ and fails the build if anything they point at is missing.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip, verifyZip } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const cleanOnly = args.includes('--clean-only');
const zip = args.includes('--zip');
const outArg = args.find((arg) => arg.startsWith('--out='));
const out = path.resolve(root, outArg ? outArg.slice('--out='.length) : 'dist');
/**
 * How the output is referred to in messages, so `--out` never reads as dist/.
 * Relative while it is inside the repository, absolute once it is not — a
 * temporary directory expressed as `../../../AppData/...` is not a legible answer
 * to "which build failed".
 */
const relativeOut = path.relative(root, out).replaceAll(path.sep, '/');
const outLabel = relativeOut && !relativeOut.startsWith('..') ? `${relativeOut}/` : out;

/**
 * Everything that belongs in a shipped extension, and nothing else.
 *
 * Notably absent: `icons/*.svg`. Those are the *sources* `tools/make-icons.js`
 * draws the PNGs from, and nothing at runtime asks for them. Notably present: all
 * three PNG sets, because the toolbar icon changes with state and only the default
 * set appears in the manifest — see the icon check in `verifyReferences`.
 */
const RUNTIME_FILES = [
  'manifest.json',

  // Service worker.
  'background.js',

  // Content scripts, in manifest order: core.js defines what content.js uses.
  'core.js',
  'content.js',
  'content.css',

  // Popup.
  'popup.html',
  'popup.css',
  'popup.js',

  // Settings.
  'options.html',
  'options.css',
  'options.js',

  // Toolbar icons: on, off, and locked.
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'icons/icon-off16.png',
  'icons/icon-off32.png',
  'icons/icon-off48.png',
  'icons/icon-off128.png',
  'icons/icon-locked16.png',
  'icons/icon-locked32.png',
  'icons/icon-locked48.png',
  'icons/icon-locked128.png',
];

/**
 * Brings the output into line with RUNTIME_FILES without ever taking it apart.
 *
 * This directory is not a staging area. It is the extension: everything here
 * says to point the browser's Load unpacked at dist/, and an unpacked extension
 * is read from that directory on demand for the whole session rather than copied
 * into the browser. So the `rm -rf` this build used to open with was deleting a
 * live extension. For a few milliseconds of every build there was no
 * manifest.json and no popup.html on disk, and a toolbar click landing in that
 * window has nothing to open; a manifest read in it can leave the extension
 * disabled until it is reloaded by hand. Refilling the directory afterwards then
 * gave all twenty-three files a new mtime whether or not a byte of them had
 * changed, discarding whatever the browser and the virus scanner had cached and
 * charging the next popup open for reading the whole extension off disk again.
 * Both faults only ever showed up right after a change was made, because that is
 * the only time a build runs.
 *
 * So: write only what genuinely differs, write the manifest last so it never
 * points at a file that has not been written yet, and delete only what no longer
 * belongs — after the manifest that stopped naming it is already in place.
 */
async function syncRuntime() {
  await mkdir(out, { recursive: true });

  const sources = new Map();
  for (const file of RUNTIME_FILES) {
    try {
      sources.set(file, await readFile(path.join(root, file)));
    } catch {
      throw new Error(`build: ${file} is listed in RUNTIME_FILES but does not exist`);
    }
  }

  let written = 0;
  const put = async (file) => {
    const target = path.join(out, file);
    const data = sources.get(file);
    let current = null;
    try {
      current = await readFile(target);
    } catch {
      // Not there yet, so it cannot already match.
    }
    if (current?.equals(data)) return;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    written += 1;
  };

  for (const file of RUNTIME_FILES) {
    if (file !== 'manifest.json') await put(file);
  }
  await put('manifest.json');

  const wanted = new Set(RUNTIME_FILES);
  let removed = 0;
  for (const name of await listFiles(out)) {
    if (wanted.has(name)) continue;
    await rm(path.join(out, name), { force: true });
    removed += 1;
  }
  await pruneEmptyDirectories(out);

  return { written, removed };
}

/** Every file under `dir`, as forward-slash paths relative to it. */
async function listFiles(dir, prefix = '') {
  const names = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...(await listFiles(path.join(dir, entry.name), name)));
    else names.push(name);
  }
  return names;
}

/** A directory emptied by the prune above is itself no longer part of the build. */
async function pruneEmptyDirectories(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    await pruneEmptyDirectories(child);
    if ((await readdir(child)).length === 0) await rm(child, { recursive: true, force: true });
  }
}

/** Every file under `dir` with its bytes. */
async function collect(dir) {
  const names = await listFiles(dir);
  return Promise.all(
    names.map(async (name) => ({ name, data: await readFile(path.join(dir, name)) })),
  );
}

/**
 * Cross-check the assembled extension against itself.
 *
 * The allowlist above is hand-written, which means it can fall behind a new
 * module. Rather than trust it, this reads the output back and resolves every
 * local reference it can find: manifest paths, `<script src>` and
 * `<link href>` in the HTML, and static or dynamic `import`s between the JS
 * modules. Anything unresolved fails the build, which is where you want to find
 * out — not from a blank popup after loading it in Chrome.
 */
async function verifyReferences(files) {
  const present = new Set(files.map((file) => file.name));
  const text = new Map(
    files
      .filter((file) => /\.(json|html|js|css)$/.test(file.name))
      .map((file) => [file.name, file.data.toString('utf8')]),
  );
  const problems = [];

  const require = (from, target) => {
    // Resolve relative to the referring file, then normalise to archive form.
    const resolved = path
      .posix
      .normalize(path.posix.join(path.posix.dirname(from), target))
      .replace(/^\.\//, '');
    if (!present.has(resolved)) problems.push(`${from} -> ${target}`);
  };

  const manifest = JSON.parse(text.get('manifest.json'));
  const manifestPaths = new Set();
  const walk = (value) => {
    if (typeof value === 'string') {
      if (/\.(js|html|css|png|svg)$/.test(value) && !/^https?:/.test(value)) manifestPaths.add(value);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(manifest);
  for (const target of manifestPaths) require('manifest.json', target);

  for (const [name, source] of text) {
    if (name.endsWith('.html')) {
      for (const match of source.matchAll(/(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)) {
        require(name, match[1]);
      }
    }
    if (name.endsWith('.js')) {
      // Static `from "./x.js"` and dynamic `import("./x.js")`.
      for (const match of source.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
        require(name, match[1]);
      }
      /*
       * Asset paths written as plain strings.
       *
       * Decaf's toolbar icon changes with state, so `background.js` holds three
       * sets of PNG paths in an object literal and hands them to
       * `chrome.action.setIcon`. Only the default set appears in the manifest, so
       * without this the other eight files could drop out of the allowlist and the
       * build would still pass — and the failure would be an icon that silently
       * stops changing, which is exactly the kind of thing nobody notices.
       */
      for (const match of source.matchAll(/["'](icons\/[^"']+\.(?:png|svg))["']/g)) {
        require(name, match[1]);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `build: ${outLabel} references files that are not in it:\n  ${problems.join('\n  ')}\n` +
        'Add them to RUNTIME_FILES in scripts/build.mjs.',
    );
  }
}

async function writeZip(version) {
  await mkdir(artifacts, { recursive: true });
  const archivePath = path.join(artifacts, `decaf-${version}.zip`);
  const files = await collect(out);
  const bytes = createZip(files);
  await writeFile(archivePath, bytes);

  // Read it straight back: every entry is inflated and CRC-checked, so a
  // malformed archive fails here rather than at the Web Store upload.
  const entries = verifyZip(bytes);
  if (entries.length !== files.length) {
    throw new Error(`zip verification found ${entries.length} of ${files.length} entries`);
  }
  if (!entries.some((entry) => entry.name === 'manifest.json')) {
    throw new Error('zip is missing manifest.json at the archive root');
  }

  console.log(
    `wrote ${path.relative(root, archivePath)} ` +
      `(${entries.length} files, ${(bytes.length / 1024).toFixed(1)} kB, verified)`,
  );
}

async function build() {
  const { written, removed } = await syncRuntime();

  const files = await collect(out);
  await verifyReferences(files);

  const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    throw new Error(
      `build: manifest.json is ${manifest.version} but package.json is ${pkg.version}. ` +
        'Keep them in step so the store artifact is named after what it contains.',
    );
  }

  const bytes = files.reduce((total, file) => total + file.data.length, 0);
  /*
   * What actually moved, not just what is there. In watch mode this is the line
   * that tells you whether the save you just made reached the extension at all:
   * "nothing to write" straight after editing popup.js means it did not.
   */
  const touched = written || removed
    ? `${written} written${removed ? `, ${removed} removed` : ''}`
    : 'nothing to write';
  console.log(
    `build complete -> ${outLabel}  ` +
      `(${files.length} files, ${(bytes / 1024).toFixed(1)} kB, v${manifest.version}, ${touched})`,
  );
  return manifest.version;
}

async function main() {
  if (cleanOnly) {
    await rm(out, { recursive: true, force: true });
    await rm(artifacts, { recursive: true, force: true });
    console.log('cleaned dist/ and artifacts/');
    return;
  }

  const version = await build();
  if (zip) await writeZip(version);

  if (watchMode) {
    let queued = null;
    const rebuild = () => {
      clearTimeout(queued);
      // Editors save in bursts; one rebuild per burst is enough.
      queued = setTimeout(() => {
        build().catch((error) => console.error(error.message));
      }, 120);
    };
    for (const target of ['.', 'icons']) {
      watch(path.join(root, target), { persistent: true }, (_event, filename) => {
        if (filename && RUNTIME_FILES.some((file) => file.endsWith(filename))) rebuild();
      });
    }
    console.log('watching for changes... load dist/ in Chrome and press reload after each rebuild');
    return;
  }

  console.log('Load it via chrome://extensions -> Developer mode -> Load unpacked -> select dist/');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
