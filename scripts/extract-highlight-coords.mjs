// Runs the tesseract CLI over public/article.png, locates the words making up
// TARGET_PHRASE, and writes their merged bounding box (plus the image's
// pixel dimensions) to src/ArticleHighlight/highlight-data.json so the
// composition can position the highlighter without doing OCR at render time.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagePath = path.join(__dirname, "../public/article.png");
const outDir = path.join(__dirname, "../src/ArticleHighlight");
const outPath = path.join(outDir, "highlight-data.json");

const TARGET_PHRASE = ["$20", "trillion", "in", "2025"];

const normalize = (word) => word.toLowerCase().replace(/[^a-z0-9$]/g, "");

function runTesseract(image) {
  return execFileSync("tesseract", [image, "stdout", "tsv"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
  });
}

function parseTsv(tsv) {
  const [headerLine, ...lines] = tsv.trim().split("\n");
  const header = headerLine.split("\t");
  return lines
    .filter(Boolean)
    .map((line) => {
      const cols = line.split("\t");
      const row = {};
      header.forEach((key, i) => {
        row[key] = cols[i];
      });
      return row;
    });
}

function findPhraseBoundingBox(words, phrase) {
  const target = phrase.map(normalize);
  for (let i = 0; i <= words.length - target.length; i++) {
    const slice = words.slice(i, i + target.length);
    if (slice.every((w, j) => normalize(w.text) === target[j])) {
      return slice;
    }
  }
  return null;
}

const tsv = runTesseract(imagePath);
const rows = parseTsv(tsv);

const pageRow = rows.find((r) => r.level === "1");
const imageWidth = Number(pageRow.width);
const imageHeight = Number(pageRow.height);

const words = rows
  .filter((r) => r.level === "5" && r.text && r.text.trim().length > 0)
  .map((r) => ({
    text: r.text,
    left: Number(r.left),
    top: Number(r.top),
    width: Number(r.width),
    height: Number(r.height),
  }));

const match = findPhraseBoundingBox(words, TARGET_PHRASE);
if (!match) {
  throw new Error(
    `Could not locate the phrase "${TARGET_PHRASE.join(" ")}" in the OCR output of ${imagePath}`,
  );
}

const left = Math.min(...match.map((w) => w.left));
const top = Math.min(...match.map((w) => w.top));
const right = Math.max(...match.map((w) => w.left + w.width));
const bottom = Math.max(...match.map((w) => w.top + w.height));

// A real highlighter marker overshoots the glyphs a little, especially
// below the baseline (descenders) and above the cap height.
const textWidth = right - left;
const textHeight = bottom - top;
const padX = textWidth * 0.015;
const padTop = textHeight * 0.14;
const padBottom = textHeight * 0.26;

const highlight = {
  left: left - padX,
  top: top - padTop,
  width: textWidth + padX * 2,
  height: textHeight + padTop + padBottom,
};

const data = {
  sourceImage: "article.png",
  imageWidth,
  imageHeight,
  phrase: TARGET_PHRASE.join(" "),
  words: match,
  highlight,
  highlightFraction: {
    left: highlight.left / imageWidth,
    top: highlight.top / imageHeight,
    width: highlight.width / imageWidth,
    height: highlight.height / imageHeight,
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
console.log(data);
