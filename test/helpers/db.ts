import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { closeDb } from "@/lib/db";

/**
 * Spins up an isolated SQLite database in a temp dir for a single test, by
 * pointing WORKTV_DB_PATH at it and resetting the cached connection. Returns a
 * cleanup function that closes the connection and removes the temp files.
 *
 * Usage:
 *   let cleanup: () => void;
 *   beforeEach(() => { cleanup = useTempDb(); });
 *   afterEach(() => cleanup());
 */
export function useTempDb(): () => void {
  const dir = mkdtempSync(join(tmpdir(), "worktv-test-"));
  const dbPath = join(dir, "recordings.db");
  const prev = process.env.WORKTV_DB_PATH;

  closeDb();
  process.env.WORKTV_DB_PATH = dbPath;

  return () => {
    closeDb();
    if (prev === undefined) {
      delete process.env.WORKTV_DB_PATH;
    } else {
      process.env.WORKTV_DB_PATH = prev;
    }
    rmSync(dir, { recursive: true, force: true });
  };
}
