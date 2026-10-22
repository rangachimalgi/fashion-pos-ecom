import JsBarcode from "jsbarcode";
import { STORE_TAG_BRAND, type HangTag } from "@/lib/storeTag";

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tagHtml(tag: HangTag | undefined) {
  if (!tag) return `<div class="tag"></div>`;
  return `<div class="tag">
    <div class="brand">${esc(STORE_TAG_BRAND)}</div>
    <svg class="bc" data-code="${esc(tag.barcode)}"></svg>
    <div class="name">${esc(tag.name)}</div>
    <div class="code">${esc(tag.code)}${tag.detail ? ` ${esc(tag.detail)}` : ""}</div>
    <div class="foot"><span>${esc(tag.size)}</span><span>RATE: ${esc(tag.rateLabel)}</span></div>
  </div>`;
}

export function printHangTags(tags: HangTag[]) {
  const rows: HangTag[][] = [];
  for (let i = 0; i < tags.length; i += 2) rows.push(tags.slice(i, i + 2));

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  const body = rows
    .map((row) => `<div class="row">${tagHtml(row[0])}${tagHtml(row[1])}</div>`)
    .join("");

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <title></title>
  <style>
    @page { size: 4in 1in; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 4in; background: #fff; color: #000; }
    .row {
      display: flex;
      width: 4in;
      height: 1in;
      page-break-after: always;
      break-after: page;
    }
    .row:last-child { page-break-after: auto; break-after: auto; }
    .tag {
      width: 2in;
      height: 1in;
      padding: 0.05in 0.07in 0.04in;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
      color: #000;
    }
    .brand { font-size: 7px; font-weight: 800; text-align: center; }
    .bc { display: block; width: 1.86in; height: 0.36in; margin: 0.02in 0; }
    .name { font-size: 10px; font-weight: 900; text-transform: uppercase; white-space: nowrap; overflow: hidden; }
    .code { font-size: 8px; font-weight: 700; white-space: nowrap; overflow: hidden; }
    .foot { display: flex; justify-content: space-between; margin-top: 0.03in; font-size: 11px; font-weight: 900; }
  </style>
</head>
<body>${body}</body>
</html>`);
  doc.close();

  for (const svg of doc.querySelectorAll("svg.bc")) {
    const code = svg.getAttribute("data-code") || "";
    if (!code) continue;
    JsBarcode(svg, code, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 40,
      width: 1.15,
      background: "transparent",
    });
  }

  const cleanup = () => iframe.remove();
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    win.focus();
    win.print();
    window.setTimeout(cleanup, 1500);
  }, 80);
}
