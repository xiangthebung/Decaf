#!/usr/bin/env node
/** Dev-only: reports what sits next to a like count on an Instagram post. */
"use strict";

const { openTab } = require("./cdp.js");

const PROBE = () => {
  const reward = /like|view|comment|repl|repost|share|follow|subscrib|vote|save|reaction|viewer/i;
  const brief = (el) => el
    ? {
      tag: el.localName,
      role: el.getAttribute("role"),
      aria: el.getAttribute("aria-label"),
      children: el.children.length,
      text: (el.textContent || "").trim().slice(0, 22),
      icon: (() => {
        const svg = el.matches?.("svg[aria-label]") ? el : el.querySelector?.("svg[aria-label]");
        return svg ? svg.getAttribute("aria-label") : null;
      })()
    }
    : null;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const value = (node.nodeValue || "").trim();
    if (!/^[\d.,]+[KkMmBb]?$/.test(value) || value.length < 2) continue;
    const el = node.parentElement;
    if (!el || !el.getClientRects().length) continue;
    return {
      masked: [...document.body.innerText.matchAll(/—/g)].length,
      showing: (() => {
        const out = [];
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          const v = (n.nodeValue || "").trim();
          if (!/^[\d.,]+[KkMmBb]?$/.test(v) || v.length < 2) continue;
          if (!n.parentElement?.getClientRects().length) continue;
          const prev = n.parentElement.previousElementSibling || n.parentElement.parentElement?.previousElementSibling;
          const label = prev?.querySelector?.("svg[aria-label]")?.getAttribute("aria-label") || prev?.textContent?.trim() || "";
          if (reward.test(label)) out.push(`${v} (next to ${label.slice(0, 12)})`);
        }
        return out.slice(0, 6);
      })(),
      count: value,
      self: brief(el),
      prevSibling: brief(el.previousElementSibling),
      parent: brief(el.parentElement),
      parentPrev: brief(el.parentElement?.previousElementSibling),
      grandparent: brief(el.parentElement?.parentElement),
      grandparentPrev: brief(el.parentElement?.parentElement?.previousElementSibling)
    };
  }
  return { error: "no count found" };
};

(async () => {
  const tab = await openTab();
  try {
    await tab.goto(process.argv[2] || "https://www.instagram.com/natgeotv/p/DbTB7BCDhX2/");
    await tab.wait(Number(process.argv[3] || 8000));
    process.stdout.write(`${JSON.stringify(await tab.evaluate(PROBE), null, 1)}\n`);
  } finally {
    await tab.close();
  }
})();
