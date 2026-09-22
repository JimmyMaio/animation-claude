// Runs the tesseract CLI over a screenshot, locates the words making up a
// target phrase, and writes one bounding box per *text line* the phrase
// spans (plus the image's pixel dimensions) to a JSON file consumed by
// <HighlightImage>. A single merged box would be wrong for a phrase that
// wraps across lines, since it would also cover whatever text sits between
// the end of one line and the start of the next.
//
// Usage:
//   node scripts/extract-highlight-coords.mjs <imagePath> <outputJsonPath> "<phrase to highlight>"
import { execFileSync } from "node:child_process";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const [, , imageArg, outputArg, phraseArg] = process.argv;

if (!imageArg || !outputArg || !phraseArg) {
  console.error(
    'Usage: node scripts/extract-highlight-coords.mjs <imagePath> <outputJsonPath> "<phrase to highlight>"',
  );
  process.exit(1);
}

const imagePath = path.resolve(imageArg);
const outputPath = path.resolve(outputArg);

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
  return lines.filter(Boolean).map((line) => {
    const cols = line.split("\t");
    const row = {};
    header.forEach((key, i) => {
      row[key] = cols[i];
    });
    return row;
  });
}

function findPhraseWords(words, phrase) {
  const target = phrase.split(/\s+/).map(normalize).filter(Boolean);
  for (let i = 0; i <= words.length - target.length; i++) {
    const slice = words.slice(i, i + target.length);
    if (slice.every((w, j) => normalize(w.text) === target[j])) {
      return slice;
    }
  }
  return null;
}

// Groups words by their OCR text line, in reading order.
function groupByLine(words) {
  const groups = new Map();
  for (const word of words) {
    const key = `${word.block_num}-${word.par_num}-${word.line_num}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(word);
  }
  return [...groups.values()].sort(
    (a, b) => Math.min(...a.map((w) => w.top)) - Math.min(...b.map((w) => w.top)),
  );
}

// A real highlighter marker overshoots the glyphs a little, especially
// below the baseline (descenders) and above the cap height.
function boundingBoxWithPadding(lineWords) {
  const left = Math.min(...lineWords.map((w) => w.left));
  const top = Math.min(...lineWords.map((w) => w.top));
  const right = Math.max(...lineWords.map((w) => w.left + w.width));
  const bottom = Math.max(...lineWords.map((w) => w.top + w.height));
  const textWidth = right - left;
  const textHeight = bottom - top;
  const padX = textWidth * 0.015;
  const padTop = textHeight * 0.14;
  const padBottom = textHeight * 0.26;
  return {
    left: left - padX,
    top: top - padTop,
    width: textWidth + padX * 2,
    height: textHeight + padTop + padBottom,
  };
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
    block_num: r.block_num,
    par_num: r.par_num,
    line_num: r.line_num,
  }));

const match = findPhraseWords(words, phraseArg);
if (!match) {
  throw new Error(`Could not locate the phrase "${phraseArg}" in the OCR output of ${imagePath}`);
}

const highlights = groupByLine(match).map((lineWords) => {
  const box = boundingBoxWithPadding(lineWords);
  return {
    ...box,
    fraction: {
      left: box.left / imageWidth,
      top: box.top / imageHeight,
      width: box.width / imageWidth,
      height: box.height / imageHeight,
    },
  };
});

const data = {
  sourceImage: path.basename(imagePath),
  imageWidth,
  imageHeight,
  phrase: phraseArg,
  highlights,
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
console.log(data);
