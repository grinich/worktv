import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  getClipsByRecordingId,
  getRecordingById,
  insertClip,
  dbRowToClip,
} from "@/lib/db";

const CreateClipBody = z.object({
  startTime: z.number(),
  endTime: z.number(),
  title: z.string().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recordingId } = await params;

  try {
    const recording = getRecordingById(recordingId);
    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    const clipRows = getClipsByRecordingId(recordingId);
    const clips = clipRows.map(dbRowToClip);

    return NextResponse.json(clips);
  } catch (error) {
    console.error("Failed to fetch clips:", error);
    return NextResponse.json(
      { error: "Failed to fetch clips" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recordingId } = await params;

  try {
    const recording = getRecordingById(recordingId);
    if (!recording) {
      return NextResponse.json(
        { error: "Recording not found" },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = CreateClipBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "startTime and endTime are required numbers" },
        { status: 400 }
      );
    }

    const { startTime, endTime, title } = parsed.data;

    if (startTime < 0 || endTime <= startTime) {
      return NextResponse.json(
        { error: "Invalid time range" },
        { status: 400 }
      );
    }

    if (endTime > recording.duration) {
      return NextResponse.json(
        { error: "End time exceeds recording duration" },
        { status: 400 }
      );
    }

    const clipId = nanoid(8);
    const clipRow = insertClip({
      id: clipId,
      recordingId,
      title: title || undefined,
      startTime,
      endTime,
    });

    const clip = dbRowToClip(clipRow);

    return NextResponse.json(clip, { status: 201 });
  } catch (error) {
    console.error("Failed to create clip:", error);
    return NextResponse.json(
      { error: "Failed to create clip" },
      { status: 500 }
    );
  }
}
