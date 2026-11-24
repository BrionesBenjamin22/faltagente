import { describe, expect, it } from "vitest";
import { fullNotificationDate, relativeNotificationTime } from "./format";

describe("notification date formatting", () => {
  it("formats relative and complete local Argentina dates", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(relativeNotificationTime("2026-11-24T11:55:00Z", now)).toBe("hace 5 min");
    expect(relativeNotificationTime("2026-11-23T12:00:00Z", now)).toBe("ayer");
    expect(fullNotificationDate("2026-11-24T11:55:00Z")).toContain("2026");
  });
});
