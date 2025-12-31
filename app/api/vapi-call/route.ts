import { NextRequest, NextResponse } from "next/server";
import { VapiClient } from "@vapi-ai/server-sdk";

const VAPI_PUBLIC_KEY = "0ec6a5ad-e004-4ca1-a0cf-cb586cb54efd";
const VOICE_ID = "AMagyyApPEVuxcHAR8xR";

// Slot definitions with prompts for each time of day
const SLOT_PROMPTS: Record<string, string> = {
  morning:
    "This is your 6am check-in. Let's do a quick, concise 3 goals check-in for today. What are your top 3 priorities?",
  noon:
    "This is your noon check-in. Let's get an update on how we're doing on those 3 goals you set this morning.",
  evening:
    "This is your 8pm check-in. How are we tracking for the week on the weekly goals: ICP calls, investor intros, and feature development?",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slot = searchParams.get("slot");

  // Validate slot parameter
  if (!slot || !SLOT_PROMPTS[slot]) {
    return NextResponse.json(
      {
        error: "Invalid or missing slot parameter",
        validSlots: Object.keys(SLOT_PROMPTS),
      },
      { status: 400 }
    );
  }

  const phoneNumber = process.env.PHONE_NUMBER;
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "PHONE_NUMBER environment variable not set" },
      { status: 500 }
    );
  }

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "VAPI_API_KEY environment variable not set" },
      { status: 500 }
    );
  }

  try {
    const vapi = new VapiClient({ token: apiKey });

    const call = await vapi.calls.create({
      phoneNumberId: VAPI_PUBLIC_KEY,
      customer: {
        number: phoneNumber,
      },
      assistant: {
        voice: {
          provider: "11labs",
          voiceId: VOICE_ID,
        },
        firstMessage: SLOT_PROMPTS[slot],
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a personal productivity coach making a scheduled check-in call. Be friendly, concise, and encouraging. ${SLOT_PROMPTS[slot]}`,
            },
          ],
        },
      },
    });

    return NextResponse.json({
      success: true,
      slot,
      callId: call.id,
      message: `Call initiated for ${slot} check-in`,
    });
  } catch (error) {
    console.error("Vapi call error:", error);
    return NextResponse.json(
      {
        error: "Failed to initiate call",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


