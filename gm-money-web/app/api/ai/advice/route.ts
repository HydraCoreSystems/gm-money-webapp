import { NextRequest, NextResponse } from "next/server";
import { generateAiAdvice, getRecentAiAdvice, recordAiAdviceOutcome } from "@/lib/ai-advisor";

type AdviceRequest = {
  question?: string;
};

type AdviceOutcomeRequest = {
  id?: string;
  followed?: boolean;
  outcomeNote?: string;
};

export async function GET() {
  try {
    const history = await getRecentAiAdvice(8);
    return NextResponse.json({ ok: true, history });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not load advisor history.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: AdviceRequest;
  try {
    body = (await request.json()) as AdviceRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const question = String(body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ ok: false, error: "Question is required." }, { status: 400 });
  }

  if (question.length > 1200) {
    return NextResponse.json({ ok: false, error: "Question is too long. Keep it under 1200 characters." }, { status: 400 });
  }

  try {
    const result = await generateAiAdvice(question);
    const history = await getRecentAiAdvice(8);
    return NextResponse.json({ ok: true, result, history });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "AI advice request failed.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  let body: AdviceOutcomeRequest;
  try {
    body = (await request.json()) as AdviceOutcomeRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Advice id is required." }, { status: 400 });
  }

  if (typeof body.followed !== "boolean") {
    return NextResponse.json({ ok: false, error: "followed must be true or false." }, { status: 400 });
  }

  const outcomeNote = typeof body.outcomeNote === "string" ? body.outcomeNote.trim() : "";
  if (outcomeNote.length > 2000) {
    return NextResponse.json({ ok: false, error: "Outcome note is too long. Keep it under 2000 characters." }, { status: 400 });
  }

  try {
    await recordAiAdviceOutcome({ id, followed: body.followed, outcomeNote: outcomeNote || null });
    const history = await getRecentAiAdvice(8);
    return NextResponse.json({ ok: true, history });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not update advisor outcome.",
      },
      { status: 500 },
    );
  }
}
