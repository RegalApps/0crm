import { NextRequest, NextResponse } from "next/server";
import { VapiClient } from "@vapi-ai/server-sdk";

const VAPI_PHONE_NUMBER_ID = "e4511439-4772-4b31-ae08-1bc1f8a7ca5a";
const VOICE_ID = "AMagyyApPEVuxcHAR8xR";
//
// Slot definitions with prompts for each time of day
const SLOT_PROMPTS: Record<string, string> = {
  morning:
    "This is your 6am check-in. Let's do a quick, concise 3 goals check-in for today. What are your top 3 priorities?",
  noon:
    "This is your noon check-in. Let's get an update on how we're doing on those 3 goals you set this morning.",
  evening:
    "This is your 8pm check-in. How are we tracking for the week on the weekly goals: ICP calls, investor intros, and feature development?",
};

function calculateSlot(timeZone = "America/New_York") {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).format(new Date())
  );

  if (hour === 7) return "morning";
  if (hour === 13) return "noon";
  if (hour === 21) return "evening";

  return "unknown";
}

export async function GET(request: NextRequest) {  
  
  var slot = calculateSlot();

  console.log("slot", slot);

  // Validate slot parameter
  if (!slot || !SLOT_PROMPTS[slot]) {
    // return NextResponse.json(
    //   {
    //     error: "Invalid or missing slot parameter",
    //     validSlots: Object.keys(SLOT_PROMPTS),
    //   },
    //   { status: 400 }
    // );
    slot = "morning";
  }

  const phoneNumber = process.env.PHONE_NUMBER;
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "PHONE_NUMBER environment variable not set" },
      { status: 500 }
    );
  }

  console.log("phoneNumber", phoneNumber);

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "VAPI_API_KEY environment variable not set" },
      { status: 500 }
    );
  }

  console.log("apiKey", apiKey);

  try {
    const vapi = new VapiClient({ token: apiKey });

    const call = await vapi.calls.create({
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber,
      },
      assistant: {
        voice: {
          provider: "11labs",
          voiceId: VOICE_ID,
        },
        firstMessage: SLOT_PROMPTS[slot],
        transcriber: {
          provider: "deepgram",
        },
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a personal AI voice agent initiating a scheduled outbound call.

Context:
- This call is triggered automatically by a daily schedule.
- The user has opted into this call.
- Your role is to act as a concise, high-signal executive assistant.

Objectives (in order):
1. Greet the user naturally and confirm they’re available to talk.
2. Deliver a short, focused briefing relevant to the time of day.
3. Ask 1–2 sharp questions that help the user think or act.
4. End the call cleanly without rambling.

Tone:
- Confident, calm, and direct
- No hype, no therapy language
- Speak like a trusted operator, not a chatbot

Rules:
- Keep the call under 3 minutes unless the user explicitly engages.
- If the user sounds busy or dismissive, offer to reschedule and end.
- Do not explain that you are “an AI” unless asked.
- Do not mention cron jobs, automation, or system triggers.

Opening Line Example:
“Hey — it’s your daily check-in. Got two minutes?”

Closing Behavior:
- Summarize the key takeaway in one sentence.
- End decisively: “I’ll let you get back to it.”
`,
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


