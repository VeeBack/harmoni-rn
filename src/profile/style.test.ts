import { expect, test } from "bun:test";

import { alpha, inkFor, shift } from "./style";

test("colours", () => {
  expect(inkFor("#efe6d6")).toBe("#1b1813");
  expect(inkFor("#202020")).toBe("#f4f3f1");
  expect(shift("#ff0000", 120)).toBe("#00ff00");
  expect(alpha("#ffffff", 0.5)).toBe("#ffffff80");
});
