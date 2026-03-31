import { describe, expect, it } from "vitest";
import { wrapTextLines } from "./ui";

describe("wrapTextLines", () => {
  it("wraps text when the next word exceeds the max width", () => {
    const lines = wrapTextLines("signal drift reaches the corridor", 12, (value) => value.length);
    expect(lines).toEqual(["signal drift", "reaches the", "corridor"]);
  });

  it("preserves paragraph breaks", () => {
    const lines = wrapTextLines("first paragraph\nsecond one", 40, (value) => value.length);
    expect(lines).toEqual(["first paragraph", "second one"]);
  });

  it("keeps empty paragraphs as blank lines", () => {
    const lines = wrapTextLines("first\n\nthird", 40, (value) => value.length);
    expect(lines).toEqual(["first", "", "third"]);
  });
});
