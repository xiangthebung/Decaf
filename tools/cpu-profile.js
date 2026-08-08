#!/usr/bin/env node
/**
 * Names the function that is actually burning the main thread on a given site.
 *
 *   npm run build && node tools/cpu-profile.js facebook /
 *
 * A CPU profile taken through the DevTools protocol while the page sits idle,
 * reported as self time per function. `tools/perf-probe.js` says a page feels
 * slow; this says which line is doing it.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const playwright = require("playwright");
const { serveAll, url } = require("./fixture-site.js");

const dist = path.join(__dirname, "..", "dist");
const site = process.argv[2] || "facebook";
const route = process.argv[3] || "/";
const seconds = Number(process.argv[4] || 6);

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-prof-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
  });
  try {
    await context.waitForEvent("serviceworker").catch(() => null);
    await serveAll(context);
    const page = await context.newPage();
    await page.goto(url(site, route));
    await page.waitForLoadState("domcontentloaded");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const cdp = await context.newCDPSession(page);
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const { profile: cpu } = await cdp.send("Profiler.stop");

    const self = new Map();
    const byId = new Map(cpu.nodes.map((node) => [node.id, node]));
    for (const node of cpu.nodes) self.set(node.id, 0);
    const total = cpu.timeDeltas.reduce((sum, delta) => sum + Math.max(0, delta), 0);
    cpu.samples.forEach((id, index) => {
      self.set(id, (self.get(id) || 0) + Math.max(0, cpu.timeDeltas[index] || 0));
    });

    const rows = [];
    for (const [id, micros] of self) {
      if (micros <= 0) continue;
      const frame = byId.get(id)?.callFrame;
      if (!frame) continue;
      const where = String(frame.url || "").split("/").pop() || "(anon)";
      rows.push({
        name: `${frame.functionName || "(anonymous)"} @ ${where}:${frame.lineNumber + 1}`,
        ms: micros / 1000
      });
    }
    rows.sort((a, b) => b.ms - a.ms);

    console.log(`\n${site}${route} — ${(total / 1000).toFixed(0)}ms wall, top self time\n`);
    for (const row of rows.slice(0, 14)) {
      console.log(`  ${row.ms.toFixed(0).padStart(6)} ms  ${row.name}`);
    }
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
