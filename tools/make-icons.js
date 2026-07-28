#!/usr/bin/env node
/**
 * Draws the Decaf icon set. One geometry description, two outputs: the SVG kept
 * as design reference and the PNGs Chrome asks for. No dependencies, no network.
 *
 *   node tools/make-icons.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const OUT = path.resolve(__dirname, "..", "icons");
const SIZES = [16, 32, 48, 128];
const SAMPLES = 4;

// A small espresso cup on a saucer, drawn in fractions of the icon box.
const GEOMETRY = {
  plate: { x0: 0.055, y0: 0.055, x1: 0.945, y1: 0.945, r: 0.22 },
  cup: { x0: 0.2, y0: 0.32, x1: 0.6, y1: 0.665, r: 0.02, rBottom: 0.175 },
  handle: { cx: 0.685, cy: 0.44, outer: 0.135, inner: 0.072 },
  saucer: { x0: 0.155, y0: 0.725, x1: 0.845, y1: 0.795, r: 0.035 },
  badge: { cx: 0.775, cy: 0.775, r: 0.155 },
  badgeBody: { x0: 0.705, y0: 0.775, x1: 0.845, y1: 0.855, r: 0.02 },
  badgeArc: { cx: 0.775, cy: 0.762, outer: 0.062, inner: 0.032 }
};

const THEMES = {
  icon: { plate: "#6f4e37", mark: "#fbf7f1", badge: null },
  "icon-off": { plate: "#ece8e1", mark: "#a8a099", badge: null },
  "icon-locked": { plate: "#6f4e37", mark: "#fbf7f1", badge: "#f0c78a" }
};

/* ------------------------------------------------------------- geometry --- */

function insideRoundedRect(x, y, { x0, y0, x1, y1, r, rBottom }) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const top = r;
  const bottom = rBottom === undefined ? r : rBottom;
  const corners = [
    { cx: x0 + top, cy: y0 + top, r: top, test: x < x0 + top && y < y0 + top },
    { cx: x1 - top, cy: y0 + top, r: top, test: x > x1 - top && y < y0 + top },
    { cx: x0 + bottom, cy: y1 - bottom, r: bottom, test: x < x0 + bottom && y > y1 - bottom },
    { cx: x1 - bottom, cy: y1 - bottom, r: bottom, test: x > x1 - bottom && y > y1 - bottom }
  ];
  for (const corner of corners) {
    if (!corner.test) continue;
    const dx = x - corner.cx;
    const dy = y - corner.cy;
    if (dx * dx + dy * dy > corner.r * corner.r) return false;
  }
  return true;
}

function insideCircle(x, y, { cx, cy, r }) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insideRing(x, y, { cx, cy, outer, inner }) {
  const dx = x - cx;
  const dy = y - cy;
  const distance = dx * dx + dy * dy;
  return distance <= outer * outer && distance >= inner * inner;
}

/** Returns the layer name covering this point, or "" for transparent. */
function sample(x, y, theme) {
  if (!insideRoundedRect(x, y, GEOMETRY.plate)) return "";
  if (theme.badge) {
    if (insideCircle(x, y, GEOMETRY.badge)) {
      const shackle = insideRing(x, y, GEOMETRY.badgeArc) && y < GEOMETRY.badgeArc.cy;
      const body = insideRoundedRect(x, y, GEOMETRY.badgeBody);
      return shackle || body ? "plateOnBadge" : "badge";
    }
  }
  if (insideRoundedRect(x, y, GEOMETRY.cup)) return "mark";
  if (insideRing(x, y, GEOMETRY.handle)) return "mark";
  if (insideRoundedRect(x, y, GEOMETRY.saucer)) return "mark";
  return "plate";
}

function colorFor(layer, theme) {
  if (layer === "plate" || layer === "plateOnBadge") return theme.plate;
  if (layer === "mark") return theme.mark;
  if (layer === "badge") return theme.badge;
  return null;
}

function parseColor(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

/* ------------------------------------------------------------------ png --- */

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolor with alpha
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // no filter
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function render(size, theme) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = (x + (sx + 0.5) / SAMPLES) / size;
          const py = (y + (sy + 0.5) / SAMPLES) / size;
          const color = colorFor(sample(px, py, theme), theme);
          if (!color) continue;
          const [cr, cg, cb] = parseColor(color);
          r += cr;
          g += cg;
          b += cb;
          covered += 1;
        }
      }
      const total = SAMPLES * SAMPLES;
      const offset = (y * size + x) * 4;
      if (!covered) continue;
      pixels[offset] = Math.round(r / covered);
      pixels[offset + 1] = Math.round(g / covered);
      pixels[offset + 2] = Math.round(b / covered);
      pixels[offset + 3] = Math.round((covered / total) * 255);
    }
  }
  void step;
  return pixels;
}

/* ------------------------------------------------------------------ svg --- */

function svgFor(theme) {
  const s = (value) => Number((value * 128).toFixed(2));
  const { plate, cup, handle, saucer, badge, badgeBody, badgeArc } = GEOMETRY;
  const parts = [
    `<rect x="${s(plate.x0)}" y="${s(plate.y0)}" width="${s(plate.x1 - plate.x0)}" height="${s(plate.y1 - plate.y0)}" rx="${s(plate.r)}" fill="${theme.plate}"/>`,
    `<path d="M${s(cup.x0)} ${s(cup.y0)}h${s(cup.x1 - cup.x0)}v${s(cup.y1 - cup.y0 - cup.rBottom)}a${s(cup.rBottom)} ${s(cup.rBottom)} 0 0 1-${s(cup.rBottom)} ${s(cup.rBottom)}h-${s(cup.x1 - cup.x0 - cup.rBottom * 2)}a${s(cup.rBottom)} ${s(cup.rBottom)} 0 0 1-${s(cup.rBottom)}-${s(cup.rBottom)}z" fill="${theme.mark}"/>`,
    `<circle cx="${s(handle.cx)}" cy="${s(handle.cy)}" r="${s((handle.outer + handle.inner) / 2)}" fill="none" stroke="${theme.mark}" stroke-width="${s(handle.outer - handle.inner)}"/>`,
    `<rect x="${s(saucer.x0)}" y="${s(saucer.y0)}" width="${s(saucer.x1 - saucer.x0)}" height="${s(saucer.y1 - saucer.y0)}" rx="${s(saucer.r)}" fill="${theme.mark}"/>`
  ];
  if (theme.badge) {
    parts.push(
      `<circle cx="${s(badge.cx)}" cy="${s(badge.cy)}" r="${s(badge.r)}" fill="${theme.badge}"/>`,
      `<path d="M${s(badgeArc.cx - (badgeArc.outer + badgeArc.inner) / 2)} ${s(badgeArc.cy)}a${s((badgeArc.outer + badgeArc.inner) / 2)} ${s((badgeArc.outer + badgeArc.inner) / 2)} 0 0 1 ${s(badgeArc.outer + badgeArc.inner)} 0" fill="none" stroke="${theme.plate}" stroke-width="${s(badgeArc.outer - badgeArc.inner)}"/>`,
      `<rect x="${s(badgeBody.x0)}" y="${s(badgeBody.y0)}" width="${s(badgeBody.x1 - badgeBody.x0)}" height="${s(badgeBody.y1 - badgeBody.y0)}" rx="${s(badgeBody.r)}" fill="${theme.plate}"/>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">\n  ${parts.join("\n  ")}\n</svg>\n`;
}

/* ----------------------------------------------------------------- main --- */

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const written = [];
  for (const [name, theme] of Object.entries(THEMES)) {
    fs.writeFileSync(path.join(OUT, `${name}.svg`), svgFor(theme));
    written.push(`${name}.svg`);
    for (const size of SIZES) {
      const file = `${name}${size}.png`;
      fs.writeFileSync(path.join(OUT, file), encodePng(size, render(size, theme)));
      written.push(file);
    }
  }
  process.stdout.write(`${written.length} icon files written to icons/\n`);
}

main();
