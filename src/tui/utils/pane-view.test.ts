import { describe, expect, it } from "bun:test";
import { RGBA, StyledText } from "@opentui/core";
import { renderPaneView, type CursorBlock } from "./pane-view";
import { parseAnsiToStyledText } from "./ansi-renderer";

const text = (styled: StyledText) => styled.chunks.map((c) => c.text).join("");
const fit = (input: string, width: number) =>
  text(renderPaneView(parseAnsiToStyledText(input), width));

describe("renderPaneView line fitting", () => {
  it("shortens a full-width rule to exactly the width", () => {
    // Claude Code's chat box: a rule as wide as its own 174-column pane.
    const rule = "─".repeat(174);
    expect(fit(`${rule}\n❯ hello\n${rule}`, 40)).toBe(
      `${"─".repeat(40)}\n❯ hello\n${"─".repeat(40)}`,
    );
  });

  it("keeps a boxed line's right border by shortening its padding", () => {
    const top = `╭${"─".repeat(58)}╮`;
    const mid = `│ > Type your message${" ".repeat(38)}│`;
    expect(fit(`${top}\n${mid}`, 30)).toBe(
      `╭${"─".repeat(28)}╮\n│ > Type your message${" ".repeat(8)}│`,
    );
  });

  it("keeps a right-aligned hint on its line", () => {
    const line = `  ? for shortcuts${" ".repeat(40)}auto-accept on`;
    expect(fit(line, 40)).toBe(`  ? for shortcuts${" ".repeat(9)}auto-accept on`);
  });

  it("never shortens leading indentation", () => {
    const code = `${" ".repeat(12)}return someFunction(argument, another)`;
    expect(fit(code, 40)).toBe(code);
  });

  it("leaves prose and lines that already fit alone", () => {
    const prose = "a long reply line with single spaces that is wider than the preview";
    expect(fit(prose, 30)).toBe(prose);
    expect(fit("───── short", 30)).toBe("───── short");
  });

  it("leaves a line whose padding cannot absorb the excess", () => {
    const line = `some words here${" ".repeat(4)}and more words that run on and on`;
    expect(fit(line, 20)).toBe(line);
  });

  it("keeps the styling of what it shortens", () => {
    const styled = renderPaneView(
      parseAnsiToStyledText(`\x1b[38;5;246m${"─".repeat(100)}\x1b[39m`),
      20,
    );
    const rule = styled.chunks.find((c) => c.text.includes("─"))!;
    expect(rule.text).toBe("─".repeat(20));
    expect(rule.fg).toBeInstanceOf(RGBA);
  });
});

describe("renderPaneView cursor", () => {
  const fg = RGBA.fromHex("#000000");
  const bg = RGBA.fromHex("#ffffff");
  const at = (line: number, col: number): CursorBlock => ({ line, col, fg, bg });
  const draw = (input: string, cursor: CursorBlock, width = 200) =>
    renderPaneView(parseAnsiToStyledText(input), width, cursor);
  /** The text of the chunk drawn as the cursor block. */
  const cursorCell = (styled: StyledText) =>
    styled.chunks.filter((c) => c.bg === bg).map((c) => c.text);

  it("draws the block on the character at the cursor's column", () => {
    const styled = draw("first line\n❯ hello", at(1, 4));
    expect(cursorCell(styled)).toEqual(["l"]);
    expect(text(styled)).toBe("first line\n❯ hello");
  });

  it("pads out to a cursor past the end of the line", () => {
    // Claude's caret sits after "❯ ", which the capture trims to "❯".
    const styled = draw("❯", at(0, 2));
    expect(cursorCell(styled)).toEqual([" "]);
    expect(text(styled)).toBe("❯  ");
  });

  it("counts wide characters as two columns", () => {
    expect(cursorCell(draw("日本語", at(0, 2)))).toEqual(["本"]);
    expect(cursorCell(draw("日本語", at(0, 3)))).toEqual(["本"]);
  });

  it("keeps the cursor cell when fitting shortens the padding it sits in", () => {
    // A Gemini-style box: the caret sits on the first padding space.
    const line = `│ > hi${" ".repeat(40)}│`;
    const styled = draw(line, at(0, 6), 20);
    expect(cursorCell(styled)).toEqual([" "]);
    expect(text(styled)).toBe(`│ > hi${" ".repeat(13)}│`);
  });

  it("draws nothing for a line the capture does not have", () => {
    expect(cursorCell(draw("only line", at(5, 0)))).toEqual([]);
  });
});
