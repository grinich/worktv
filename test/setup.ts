import { afterEach, vi } from "vitest";

// Several code paths intentionally console.error on handled failures (e.g.
// transcript fetch errors, route 500s). Keep test output clean but allow
// individual tests to assert on these by spying when they care.
vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  vi.restoreAllMocks();
  // Re-establish the console.error silence after restoreAllMocks.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
