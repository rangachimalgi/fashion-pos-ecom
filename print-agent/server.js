import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const app = express();
const PORT = Number(process.env.PORT || 5000);
const PRINTER = process.env.LABEL_PRINTER || "";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

function tsplText(value) {
  return String(value ?? "")
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 48);
}

function oneLabel(x, tag) {
  if (!tag) return "";
  const barcode = tsplText(tag.barcode || tag.code);
  const brand = tsplText(tag.brand || "HOUSE OF ESHWARI VASTRA");
  const name = tsplText(tag.name);
  const code = tsplText([tag.code, tag.detail].filter(Boolean).join(" "));
  const size = tsplText(tag.size);
  const rate = tsplText(`RATE: ${tag.rateLabel || ""}`);

  return [
    `TEXT ${x},16,"ROMAN.TTF",0,1.1,1.1,"${brand}"`,
    `TEXT ${x},40,"ROMAN.TTF",0,1.5,1.5,"${name}"`,
    `TEXT ${x},72,"ROMAN.TTF",0,1.2,1.2,"${code}"`,
    `TEXT ${x},100,"ROMAN.TTF",0,1.5,1.5,"${size}  ${rate}"`,
    barcode ? `BARCODE ${x},140,"128",60,1,0,2,4,"${barcode}"` : "",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function tsplRow(left, right) {
  return [
    "SIZE 110 mm, 50 mm",
    // Stock: 4 stickers across (27.4 x 50 mm each), plain gap labels, no black mark.
    "GAP 3 mm, 0 mm",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    oneLabel(60, left),
    oneLabel(520, right),
    "PRINT 1,1",
    "",
  ].join("\r\n");
}

function pairTags(tags) {
  const rows = [];
  for (let i = 0; i < tags.length; i += 2) {
    rows.push({ left: tags[i], right: tags[i + 1] || null });
  }
  return rows;
}

async function sendToPrinter(payload) {
  const dir = await mkdtemp(join(tmpdir(), "ev-labels-"));
  const file = join(dir, "labels.tspl");
  await writeFile(file, payload, "utf8");

  if (!PRINTER) {
    const saved = join(process.cwd(), "last-job.tspl");
    await writeFile(saved, payload, "utf8");
    throw new Error(
      "LABEL_PRINTER is not set. Wrote last-job.tspl. Set LABEL_PRINTER to the Windows printer share, e.g. \\\\localhost\\TSC TE200"
    );
  }

  if (process.platform === "win32") {
    await execFileAsync("cmd.exe", ["/c", `copy /B "${file}" "${PRINTER}"`]);
    return;
  }

  await execFileAsync("lp", ["-d", PRINTER, "-o", "raw", file]);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, printer: PRINTER || null });
});

app.post("/api/print-labels", async (req, res) => {
  try {
    const explicitRows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const rows = explicitRows
      ? explicitRows.map((row) => ({
          left: row?.left ?? null,
          right: row?.right ?? null,
        }))
      : pairTags(tags);

    if (!rows.length || !rows.some((row) => row.left || row.right)) {
      res.status(400).json({ error: "No tags in request" });
      return;
    }

    const job = rows.map((row) => tsplRow(row.left, row.right)).join("\r\n");
    await sendToPrinter(job);
    res.json({ ok: true, rows: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Print failed" });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Eshwari label agent on http://localhost:${PORT}`);
  console.log(PRINTER ? `Printer: ${PRINTER}` : "No LABEL_PRINTER set — print will save last-job.tspl");
});
