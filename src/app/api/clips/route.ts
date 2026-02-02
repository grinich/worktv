import { NextResponse } from "next/server";
import { getAllClips, getRecordingById, dbRowToClip } from "@/lib/db";

export async function GET() {
  try {
    const clipRows = getAllClips();
    const clips = clipRows.map((row) => {
      const recording = getRecordingById(row.recording_id);
      return {
        ...dbRowToClip(row),
        recordingTitle: recording?.title ?? "Unknown Recording",
      };
    });

    return NextResponse.json(clips);
  } catch (error) {
    console.error("Failed to fetch clips:", error);
    return NextResponse.json(
      { error: "Failed to fetch clips" },
      { status: 500 }
    );
  }
}
