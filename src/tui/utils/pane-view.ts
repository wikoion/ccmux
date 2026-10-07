import { StyledText, type TextChunk } from "@opentui/core";
import { displayWidth } from "./format";

/**
 * Turns a captured pane into what the preview draws. Agent TUIs lay out for
 * their own pane, which is usually wider than the preview: Claude Code's chat
 * box is two `─` rules exactly as wide as its pane, and word wrap split each
 * one into a full line plus a stub.
 */

/** Split chunks into lines at "\n", dropping the newlines. */
function splitLines(chunks: TextChunk[]): TextChunk[][] {
  const lines: TextChunk[][] = [[]];
  for (const chunk of chunks) {
    chunk.text.split("\n").forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text) lines[lines.length - 1]!.push({ ...chunk, text });
    });
  }
  return lines;
}

function joinLines(lines: TextChunk[][]): TextChunk[] {
  const out: TextChunk[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ __isChunk: true, text: "\n" });
    out.push(...line);
  });
  return out;
}

/**
 * Runs a too-wide line can give columns back from: 3+ rule characters
 * anywhere, or 3+ spaces after text. Leading spaces are indentation and are
 * never touched, so code keeps its shape.
 */
const SHRINKABLE_RUN = /─{3,}|━{3,}|═{3,}|(?<=\S) {3,}/g;

/**
 * The string ranges to delete so `text` fits `width` columns, longest run
 * first, each run keeping at least one character. Null when the line already
 * fits or its runs cannot absorb the excess: it then wraps as before.
 */
function fitRanges(text: string, width: number): Array<[number, number]> | null {
  const excess = displayWidth(text) - width;
  if (excess <= 0) return null;
  const runs = [...text.matchAll(SHRINKABLE_RUN)]
    .map((m) => ({ start: m.index, length: m[0].length }))
    .sort((a, b) => b.length - a.length);
  const ranges: Array<[number, number]> = [];
  let left = excess;
  for (const run of runs) {
    if (left === 0) break;
    const take = Math.min(run.length - 1, left);
    ranges.push([run.start + 1, run.start + 1 + take]);
    left -= take;
  }
  return left === 0 ? ranges : null;
}

function removeRanges(
  line: TextChunk[],
  ranges: Array<[number, number]>,
): TextChunk[] {
  const dropped = (i: number) => ranges.some(([s, e]) => i >= s && i < e);
  const out: TextChunk[] = [];
  let offset = 0;
  for (const chunk of line) {
    let text = "";
    for (let i = 0; i < chunk.text.length; i++) {
      if (!dropped(offset + i)) text += chunk.text[i];
    }
    offset += chunk.text.length;
    if (text) out.push({ ...chunk, text });
  }
  return out;
}

/**
 * Fit full-width lines into `width` columns by shortening their padding (the
 * rule characters or spaces a TUI fills its own pane width with), so a rule
 * stays one line and a boxed or right-aligned line keeps its right edge.
 * Lines with no padding to give, prose included, are left to word wrap.
 * Pure, for tests.
 */
export function fitPaneLines(styled: StyledText, width: number): StyledText {
  if (width <= 0) return styled;
  const lines = splitLines(styled.chunks).map((line) => {
    const ranges = fitRanges(line.map((c) => c.text).join(""), width);
    return ranges ? removeRanges(line, ranges) : line;
  });
  return new StyledText(joinLines(lines));
}
