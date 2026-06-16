import { NextResponse } from "next/server";
import { z } from "zod";
import { generateClipTitle } from "@/lib/ai/summarize";

const Segment = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  speaker: z.string(),
  text: z.string(),
});

const ClipTitleBody = z.object({
  clipSegments: z.array(Segment),
  fullTranscript: z.array(Segment).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = ClipTitleBody.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "clipSegments array is required" },
        { status: 400 }
      );
    }

    const { clipSegments, fullTranscript } = parsed.data;

    if (clipSegments.length === 0) {
      return NextResponse.json({ title: "" });
    }

    const title = await generateClipTitle(clipSegments, fullTranscript);
    return NextResponse.json({ title });
  } catch (error) {
    console.error("Error generating clip title:", error);
    return NextResponse.json(
      { error: "Failed to generate clip title" },
      { status: 500 }
    );
  }
}
