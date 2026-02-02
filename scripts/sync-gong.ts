import { config } from "dotenv";
import Database from "better-sqlite3";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { GongCall, GongCallTranscript, GongParty, GongCallMedia } from "@/types/gong";
import { isGongConfigured } from "@/lib/gong/auth";
import {
  listAllCalls,
  getTranscripts,
  GongRateLimitError,
  sleep,
} from "@/lib/gong/calls";
import {
  buildSpeakerMap,
  extractSpeakers,
  parseGongTranscript,
} from "@/lib/gong/transform";

// Load .env.local file
config({ path: join(process.cwd(), ".env.local") });

// Config
const DB_PATH = join(process.cwd(), "data", "recordings.db");
const SCHEMA_PATH = join(process.cwd(), "src", "lib", "db", "schema.sql");

// Gong media URLs typically expire after 8 hours
const MEDIA_URL_EXPIRY_HOURS = 8;

interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

interface Speaker {
  id: string;
  name: string;
  color: string;
}

// Database operations
function initDb(): Database.Database {
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  return db;
}

function upsertRecording(
  db: Database.Database,
  recording: {
    id: string;
    title: string;
    description?: string;
    videoUrl: string;
    duration: number;
    space: string;
    source: string;
    mediaType: string;
    mediaUrlExpiresAt?: string;
    createdAt: string;
  }
): void {
  db.prepare(
    `INSERT OR REPLACE INTO recordings (id, title, description, video_url, duration, space, source, media_type, media_url_expires_at, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    recording.id,
    recording.title,
    recording.description ?? null,
    recording.videoUrl,
    recording.duration,
    recording.space,
    recording.source,
    recording.mediaType,
    recording.mediaUrlExpiresAt ?? null,
    recording.createdAt,
    new Date().toISOString()
  );
}

function deleteRecordingData(db: Database.Database, recordingId: string): void {
  db.prepare(`DELETE FROM segments WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM speakers WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM video_files WHERE recording_id = ?`).run(recordingId);
  db.prepare(`DELETE FROM chat_messages WHERE recording_id = ?`).run(recordingId);
}

function insertSegments(
  db: Database.Database,
  recordingId: string,
  segments: TranscriptSegment[]
): void {
  const stmt = db.prepare(
    `INSERT INTO segments (id, recording_id, start_time, end_time, speaker, text)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction((segs: TranscriptSegment[]) => {
    for (const seg of segs) {
      stmt.run(
        `${recordingId}-${seg.id}`,
        recordingId,
        seg.startTime,
        seg.endTime,
        seg.speaker,
        seg.text
      );
    }
  });

  insertMany(segments);
}

function insertSpeakers(
  db: Database.Database,
  recordingId: string,
  speakers: Speaker[]
): void {
  const stmt = db.prepare(
    `INSERT INTO speakers (id, recording_id, name, color)
     VALUES (?, ?, ?, ?)`
  );

  const insertMany = db.transaction((spks: Speaker[]) => {
    for (const spk of spks) {
      stmt.run(`${recordingId}-${spk.id}`, recordingId, spk.name, spk.color);
    }
  });

  insertMany(speakers);
}

function isRecentlySynced(db: Database.Database, recordingId: string): boolean {
  const row = db
    .prepare(`SELECT synced_at FROM recordings WHERE id = ?`)
    .get(recordingId) as { synced_at: string } | undefined;

  if (!row) return false;

  // Consider synced if within the last hour
  const syncedAt = new Date(row.synced_at);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return syncedAt > oneHourAgo;
}

// Process a single call
function processCall(
  db: Database.Database,
  callData: { metaData: GongCall; parties?: GongParty[]; media?: GongCallMedia },
  transcriptMap: Map<string, GongCallTranscript>,
  force: boolean
): { synced: boolean; skipped: boolean; title: string } {
  const call = callData.metaData;
  const parties = callData.parties ?? [];
  const media = callData.media;
  const recordingId = `gong_${call.id}`;

  // Skip if recently synced (unless force)
  if (!force && isRecentlySynced(db, recordingId)) {
    return { synced: false, skipped: true, title: call.title };
  }

  console.log(`📥 Syncing "${call.title}"...`);

  try {
    // Get media URL from the call data (included via contentSelector)
    const isVideo = call.media === "Video";
    const mediaUrl = isVideo ? media?.videoUrl : media?.audioUrl;

    if (!mediaUrl) {
      console.log(`   ⚠️  No media URL available for "${call.title}"`);
      return { synced: false, skipped: false, title: call.title };
    }

    // Calculate media URL expiration (8 hours from now)
    const mediaUrlExpiresAt = new Date(
      Date.now() + MEDIA_URL_EXPIRY_HOURS * 60 * 60 * 1000
    ).toISOString();

    // Get transcript if available
    const transcript = transcriptMap.get(call.id);
    const speakerMap = buildSpeakerMap(parties);

    let segments: TranscriptSegment[] = [];
    let speakers: Speaker[] = [];

    if (transcript && transcript.transcript.length > 0) {
      segments = parseGongTranscript(transcript, speakerMap);
      speakers = extractSpeakers(segments);
    }

    // Insert/update recording
    upsertRecording(db, {
      id: recordingId,
      title: call.title || "Untitled Call",
      description: call.purpose ?? undefined,
      videoUrl: mediaUrl,
      duration: call.duration,
      space: "Gong Calls",
      source: "gong",
      mediaType: call.media.toLowerCase(), // "video" or "audio"
      mediaUrlExpiresAt,
      createdAt: call.started,
    });

    // Clear existing segments and speakers
    deleteRecordingData(db, recordingId);

    // Insert new data
    if (segments.length > 0) {
      insertSegments(db, recordingId, segments);
    }
    if (speakers.length > 0) {
      insertSpeakers(db, recordingId, speakers);
    }

    const transcriptInfo =
      segments.length > 0
        ? `${segments.length} segments, ${speakers.length} speakers`
        : "no transcript";

    console.log(
      `   ✓ "${call.title}" - ${transcriptInfo}, ${call.media.toLowerCase()}`
    );

    return { synced: true, skipped: false, title: call.title };
  } catch (error) {
    console.log(`   ❌ "${call.title}" - Error: ${error}`);
    return { synced: false, skipped: false, title: call.title };
  }
}

// Main sync function
async function sync(): Promise<void> {
  // Check if Gong is configured
  if (!isGongConfigured()) {
    console.log("⚠️  Gong API credentials not configured.");
    console.log("   Set GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET in .env.local");
    console.log("   Skipping Gong sync.\n");
    return;
  }

  const force = process.argv.includes("--force");

  // Parse --months=N argument (default 3)
  const monthsArg = process.argv.find((arg) => arg.startsWith("--months="));
  const months = monthsArg ? parseInt(monthsArg.split("=")[1], 10) : 3;

  console.log("🔄 Starting Gong sync...\n");
  if (force) {
    console.log("   ⚠️  Force mode: re-syncing all recordings\n");
  }

  // Initialize database
  console.log("📦 Initializing database...");
  const db = initDb();
  console.log(`   Database: ${DB_PATH}\n`);

  // Calculate date range
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setMonth(fromDate.getMonth() - months);

  // List all calls (with media URLs included)
  console.log(`📋 Fetching calls list (last ${months} month${months > 1 ? "s" : ""})...`);

  let calls: { metaData: GongCall; parties?: GongParty[]; media?: GongCallMedia }[];
  try {
    calls = await listAllCalls({
      fromDateTime: fromDate.toISOString(),
      toDateTime: toDate.toISOString(),
      includeMedia: true,
    });
  } catch (error) {
    if (error instanceof GongRateLimitError) {
      console.log(`   ⏳ Rate limited. Try again in ${error.retryAfterSeconds}s`);
      db.close();
      return;
    }
    throw error;
  }

  console.log(`   Found ${calls.length} total calls\n`);

  if (calls.length === 0) {
    console.log("✅ No calls to sync.");
    db.close();
    return;
  }

  // Batch fetch transcripts (Gong allows batch requests)
  console.log("📝 Fetching transcripts...");
  const TRANSCRIPT_BATCH_SIZE = 50;
  const MAX_RETRIES_PER_BATCH = 3;
  const transcriptMap = new Map<string, GongCallTranscript>();

  for (let i = 0; i < calls.length; i += TRANSCRIPT_BATCH_SIZE) {
    const batch = calls.slice(i, i + TRANSCRIPT_BATCH_SIZE);
    const callIds = batch.map((c) => c.metaData.id);
    let retryCount = 0;

    while (retryCount < MAX_RETRIES_PER_BATCH) {
      try {
        const transcriptResponse = await getTranscripts(callIds);
        for (const transcript of transcriptResponse.callTranscripts) {
          transcriptMap.set(transcript.callId, transcript);
        }
        console.log(
          `   Fetched transcripts ${i + 1}-${Math.min(i + TRANSCRIPT_BATCH_SIZE, calls.length)} of ${calls.length}`
        );
        break; // Success, exit retry loop
      } catch (error) {
        if (error instanceof GongRateLimitError) {
          retryCount++;
          if (retryCount >= MAX_RETRIES_PER_BATCH) {
            console.error(
              `\n❌ RATE LIMIT ERROR: Exceeded max retries (${MAX_RETRIES_PER_BATCH}) for transcript batch ${i + 1}-${Math.min(i + TRANSCRIPT_BATCH_SIZE, calls.length)}`
            );
            console.error(`   Gong is rate limiting requests. Wait ${error.retryAfterSeconds}s and try again.`);
            console.error(`   You can also try syncing fewer months with --months=1\n`);
            throw error;
          }
          console.log(`   ⏳ Rate limited (attempt ${retryCount}/${MAX_RETRIES_PER_BATCH}), waiting ${error.retryAfterSeconds}s...`);
          await sleep(error.retryAfterSeconds * 1000);
        } else {
          console.log(`   ⚠️  Failed to fetch batch: ${error}`);
          break; // Non-rate-limit error, skip this batch
        }
      }
    }
  }

  console.log(`   Got ${transcriptMap.size} transcripts\n`);

  // Process all calls
  console.log("📥 Syncing recordings...\n");
  const results: { synced: boolean; skipped: boolean; title: string }[] = [];

  for (const call of calls) {
    const result = processCall(db, call, transcriptMap, force);
    results.push(result);
  }

  const synced = results.filter((r) => r.synced).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.synced && !r.skipped).length;

  console.log(`\n✅ Gong sync complete!`);
  console.log(`   Synced: ${synced}`);
  console.log(`   Skipped: ${skipped} (already synced)`);
  if (failed > 0) {
    console.log(`   Failed: ${failed}`);
  }

  db.close();
}

// Run
sync().catch((error) => {
  console.error("❌ Gong sync failed:", error);
  process.exit(1);
});
