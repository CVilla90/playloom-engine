import { describe, expect, it } from "vitest";
import { SeededRng } from "./rng";

describe("SeededRng", () => {
  it("is deterministic for same seed", () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);

    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it("supports state restore", () => {
    const rng = new SeededRng(99);
    const first = rng.next();
    const state = rng.getState();
    const second = rng.next();

    rng.setState(state);
    const secondAgain = rng.next();

    expect(first).not.toEqual(second);
    expect(secondAgain).toEqual(second);
  });
});
