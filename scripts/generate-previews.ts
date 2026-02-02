import { config } from "dotenv";
import Database from "better-sqlite3";
import { execSync, spawn } from "child_process";
import { mkdirSync, existsSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";

// Load .env.local file
config({ path: join(process.cwd(), ".env.local") });

// Config
const DB_PATH = join(process.cwd(), "data", "recordings.db");
const PREVIEWS_DIR = join(process.cwd(), "public", "previews");
const TEMP_DIR = join(process.cwd(), ".preview-temp");

// GIF settings
const GIF_DURATION = 3; // seconds
const GIF_WIDTH = 320; // pixels
const GIF_FPS = 10;
const NUM_CANDIDATES = 5;

interface RecordingRow {
  id: string;
  title: string;
  video_url: string;
  duration: number;
  preview_gif_url: string | null;
}

// Zoom OAuth
async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Missing Zoom credentials in environment variables");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://zoom.us/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "account_credentials",
      account_id: accountId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Generate candidate timestamps, avoiding first/last 10% of video
function getCandidateTimestamps(duration: number, count: number): number[] {
  const startBuffer = duration * 0.1;
  const endBuffer = duration * 0.9;
  const usableDuration = endBuffer - startBuffer;

  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    // Spread timestamps evenly across usable portion
    const offset = (usableDuration / (count + 1)) * (i + 1);
    timestamps.push(Math.floor(startBuffer + offset));
  }

  return timestamps;
}

// Extract a GIF clip using ffmpeg
async function extractGif(
  videoUrl: string,
  accessToken: string,
  startTime: number,
  outputPath: string
): Promise<boolean> {
  const urlWithToken = `${videoUrl}?access_token=${accessToken}`;

  return new Promise((resolve) => {
    // Use -ss before -i for fast seeking (HTTP range request)
    const args = [
      "-ss", startTime.toString(),
      "-i", urlWithToken,
      "-t", GIF_DURATION.toString(),
      "-vf", `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`,
      "-loop", "0",
      "-y",
      outputPath,
    ];

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0 && existsSync(outputPath)) {
        resolve(true);
      } else {
        console.log(`     ffmpeg failed: ${stderr.slice(-200)}`);
        resolve(false);
      }
    });

    ffmpeg.on("error", (err) => {
      console.log(`     ffmpeg error: ${err.message}`);
      resolve(false);
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      ffmpeg.kill();
      // Clean up partial output file if it exists
      if (existsSync(outputPath)) {
        try {
          unlinkSync(outputPath);
        } catch {
          // Ignore cleanup errors
        }
      }
      resolve(false);
    }, 60000);
  });
}

// Use Claude to pick the best GIF
async function pickBestGif(gifPaths: string[]): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || gifPaths.length === 0) {
    // No API key or no GIFs - return first one
    return 0;
  }

  if (gifPaths.length === 1) {
    return 0;
  }

  try {
    const client = new Anthropic({ apiKey });

    // Read GIFs as base64
    const images = gifPaths.map((path, index) => {
      const data = readFileSync(path);
      return {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/gif" as const,
          data: data.toString("base64"),
        },
      };
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            ...images,
            {
              type: "text",
              text: `These are ${gifPaths.length} candidate preview GIFs for a video call recording. Pick the BEST one for a thumbnail preview. Consider:
- Shows people/faces (more engaging than screen shares)
- Has visual activity/movement
- Good image quality (not blurry)
- Professional/appropriate content

Reply with ONLY the number (1-${gifPaths.length}) of the best GIF. Nothing else.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const match = text.match(/(\d+)/);
    if (match) {
      const index = parseInt(match[1], 10) - 1; // Convert 1-based to 0-based
      if (index >= 0 && index < gifPaths.length) {
        return index;
      }
    }
  } catch (err) {
    console.log(`     AI selection failed: ${err}`);
  }

  // Fallback: pick middle candidate
  return Math.floor(gifPaths.length / 2);
}

// Process a single recording
async function processRecording(
  db: Database.Database,
  recording: RecordingRow,
  accessToken: string
): Promise<boolean> {
  console.log(`\n📹 Processing "${recording.title}"...`);

  // Create temp directory for this recording
  const tempDir = join(TEMP_DIR, recording.id.replace(/[^a-zA-Z0-9]/g, "_"));
  mkdirSync(tempDir, { recursive: true });

  try {
    // Get candidate timestamps
    const timestamps = getCandidateTimestamps(recording.duration, NUM_CANDIDATES);
    console.log(`   Extracting ${timestamps.length} candidates at: ${timestamps.map(t => `${Math.floor(t/60)}:${(t%60).toString().padStart(2, "0")}`).join(", ")}`);

    // Extract GIF candidates
    const candidatePaths: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const outputPath = join(tempDir, `candidate_${i}.gif`);
      console.log(`   [${i + 1}/${timestamps.length}] Extracting at ${timestamps[i]}s...`);

      const success = await extractGif(
        recording.video_url,
        accessToken,
        timestamps[i],
        outputPath
      );

      if (success) {
        candidatePaths.push(outputPath);
      }
    }

    if (candidatePaths.length === 0) {
      console.log("   ❌ No GIFs extracted successfully");
      return false;
    }

    console.log(`   ✓ Extracted ${candidatePaths.length} candidates`);

    // Pick the best one using AI
    console.log("   🤖 Selecting best preview with AI...");
    const bestIndex = await pickBestGif(candidatePaths);
    console.log(`   ✓ Selected candidate ${bestIndex + 1}`);

    // Copy best GIF to public directory
    const baseFilename = recording.id.replace(/[^a-zA-Z0-9]/g, "_");
    const gifFilename = `${baseFilename}.gif`;
    const posterFilename = `${baseFilename}.jpg`;
    const gifPath = join(PREVIEWS_DIR, gifFilename);
    const posterPath = join(PREVIEWS_DIR, posterFilename);

    execSync(`cp "${candidatePaths[bestIndex]}" "${gifPath}"`);

    // Extract first frame as poster image
    console.log("   📸 Extracting poster frame...");
    execSync(
      `ffmpeg -i "${gifPath}" -vframes 1 -y "${posterPath}" 2>/dev/null`
    );

    // Update database with both URLs
    const previewUrl = `/previews/${gifFilename}`;
    const posterUrl = `/previews/${posterFilename}`;
    db.prepare(`UPDATE recordings SET preview_gif_url = ?, poster_url = ? WHERE id = ?`).run(
      previewUrl,
      posterUrl,
      recording.id
    );

    console.log(`   ✓ Saved: ${previewUrl} + ${posterUrl}`);
    return true;
  } finally {
    // Cleanup temp files
    try {
      const files = readdirSync(tempDir);
      for (const file of files) {
        unlinkSync(join(tempDir, file));
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Main function
async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  console.log("🎬 Starting preview GIF generation...\n");

  // Check for ffmpeg
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
  } catch {
    console.error("❌ ffmpeg not found. Please install it first:");
    console.error("   brew install ffmpeg");
    process.exit(1);
  }

  // Ensure directories exist
  mkdirSync(PREVIEWS_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  // Open database
  const db = new Database(DB_PATH);

  // Get recordings without previews (or all if force)
  let query = `SELECT id, title, video_url, duration, preview_gif_url
               FROM recordings
               WHERE duration >= 60`;

  if (!force) {
    query += ` AND (preview_gif_url IS NULL OR preview_gif_url = '')`;
  }

  query += ` ORDER BY created_at DESC`;

  if (limit) {
    query += ` LIMIT ?`;
  }

  const recordings = (limit
    ? db.prepare(query).all(limit)
    : db.prepare(query).all()) as RecordingRow[];

  if (recordings.length === 0) {
    console.log("✅ All recordings already have preview GIFs!");
    db.close();
    return;
  }

  console.log(`Found ${recordings.length} recording(s) to process\n`);

  // Get Zoom access token
  console.log("🔑 Authenticating with Zoom...");
  const accessToken = await getZoomAccessToken();
  console.log("   ✓ Authenticated");

  // Process recordings
  let success = 0;
  let failed = 0;

  for (const recording of recordings) {
    try {
      const result = await processRecording(db, recording, accessToken);
      if (result) {
        success++;
      } else {
        failed++;
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err}`);
      failed++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Success: ${success}`);
  console.log(`   Failed: ${failed}`);

  db.close();
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
