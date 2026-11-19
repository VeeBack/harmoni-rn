import { expect, test } from "bun:test";

import { countdown, dayPart, whenPhrase } from "./day-part";

test("parts of the day", () => {
  expect(dayPart(new Date(2026, 10, 18, 9, 30)).label).toBe("Morning");
  expect(dayPart(new Date(2026, 10, 18, 5, 0)).label).toBe("Early Morning");
  expect(dayPart(new Date(2026, 10, 18, 23, 0)).label).toBe("Late Night");
  // 1am Saturday is still Friday night.
  expect(dayPart(new Date(2026, 10, 21, 1, 0)).label).toBe("Friday Night");
  expect(dayPart(new Date(2026, 10, 20, 18, 0)).label).toBe("Friday Evening");
  expect(dayPart(new Date(2026, 10, 18, 9, 30)).endsAt.getHours()).toBe(12);
  expect(dayPart(new Date(2026, 10, 18, 23, 0)).endsAt.getHours()).toBe(4);
});

test("words", () => {
  expect(whenPhrase("Morning")).toBe("in the mornings");
  expect(whenPhrase("Friday Night")).toBe("on Friday nights");
  expect(whenPhrase("Late Night")).toBe("late at night");
  expect(countdown(3 * 3600_000 + 12 * 60_000)).toBe("New Spice in 3h 12m");
  expect(countdown(0)).toBe("New Spice on the way");
});
