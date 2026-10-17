// Generates the PWA icons in public/icons from SVG (run: node scripts/generate-icons.mjs).
// The look follows design/chosen: a mint sticker with a thick ink outline and hard shadow on
// paper, an ink check mark, and a strip of yellow masking tape.
import { mkdirSync, writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";

const PAPER = "#f4efe8";
const INK = "#141416";
const MINT = "#a9dcc6";
const TAPE = "#f5e27d";

// The artwork on a 512 grid. `inset` shrinks it toward the center (maskable icons need a safe zone).
function artwork({ background, inset = 0 }) {
  const s = (512 - inset * 2) / 512;
  const t = (v) => inset + v * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${background}"/>
  <rect x="${t(104)}" y="${t(118)}" width="${320 * s}" height="${320 * s}" rx="${44 * s}" fill="${INK}"/>
  <rect x="${t(80)}" y="${t(94)}" width="${320 * s}" height="${320 * s}" rx="${44 * s}" fill="${MINT}" stroke="${INK}" stroke-width="${22 * s}"/>
  <path d="M ${t(150)} ${t(258)} L ${t(218)} ${t(326)} L ${t(338)} ${t(186)}" fill="none" stroke="${INK}" stroke-width="${46 * s}" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="rotate(-8 ${t(240)} ${t(96)})">
    <rect x="${t(170)}" y="${t(72)}" width="${140 * s}" height="${48 * s}" fill="${TAPE}" stroke="${INK}" stroke-width="${8 * s}"/>
  </g>
</svg>`;
}

// Android status-bar badge: white silhouette on transparent; the OS tints it.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <path d="M 22 50 L 40 68 L 74 30" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

async function render(svg, size, file) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const image = new ImageResponse(
    h("div", { style: { display: "flex", width: "100%", height: "100%" } }, h("img", { src, width: size, height: size })),
    { width: size, height: size },
  );
  writeFileSync(file, Buffer.from(await image.arrayBuffer()));
  console.log("wrote", file);
}

mkdirSync("public/icons", { recursive: true });
await render(artwork({ background: PAPER }), 192, "public/icons/icon-192.png");
await render(artwork({ background: PAPER }), 512, "public/icons/icon-512.png");
await render(artwork({ background: MINT, inset: 56 }), 512, "public/icons/maskable-512.png");
await render(artwork({ background: PAPER }), 180, "public/icons/apple-touch-icon.png");
await render(badge, 96, "public/icons/badge-96.png");
