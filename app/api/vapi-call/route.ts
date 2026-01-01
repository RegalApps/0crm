import { NextRequest, NextResponse } from "next/server";
import { VapiClient } from "@vapi-ai/server-sdk";
import { promises as fs } from "fs";
import path from "path";

const VAPI_PHONE_NUMBER_ID = "e4511439-4772-4b31-ae08-1bc1f8a7ca5a";
const VOICE_ID = "AMagyyApPEVuxcHAR8xR";
const MAX_PREVIOUS_CALLS = 5; // Number of previous calls to fetch for context

// Slot definitions with prompts for each time of day
const SLOT_PROMPTS: Record<string, string> = {
  morning:
    "Morning. What's the ONE commitment you're making today? Be specific.",
  noon:
    "Check-in. This morning you committed to something. Did you do it?",
  evening:
    "End of day. Did you hit your commitment or not? No excuses, just facts.",
};

async function loadSalesTranscript(): Promise<string> {
  try {
    const transcriptPath = path.join(process.cwd(), "app", "Jen_abel_1-10M.txt");
    const content = await fs.readFile(transcriptPath, "utf-8");
    return content;
  } catch (error) {
    console.error("Error loading sales transcript:", error);
    return "";
  }
}

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

  return "";
}

async function fetchPreviousCallSummaries(vapi: VapiClient): Promise<string> {
  try {
    // Fetch recent calls, sorted by most recent first
    const calls = await vapi.calls.list({
      limit: MAX_PREVIOUS_CALLS,
    });

    // Extract summaries from calls that have analysis data
    const summaries: string[] = [];
    
    for (const call of calls) {
      if (call.analysis?.summary) {
        const callDate = call.createdAt 
          ? new Date(call.createdAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short", 
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZone: "America/New_York",
            })
          : "Unknown date";
        
        summaries.push(`[${callDate}]: ${call.analysis.summary}`);
      }
    }

    if (summaries.length === 0) {
      return "No previous call history available.";
    }

    return summaries.join("\n\n");
  } catch (error) {
    console.error("Error fetching previous calls:", error);
    return "Unable to retrieve previous call history.";
  }
}

export async function GET(request: NextRequest) {  
  
  var slot = calculateSlot();

  console.log("slot", slot);

  // Validate slot parameter
  if (!slot || !SLOT_PROMPTS[slot]) {
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

    // Fetch previous call summaries for context
    console.log("Fetching previous call summaries...");
    const previousCallContext = await fetchPreviousCallSummaries(vapi);
    console.log("Previous call context length:", previousCallContext.length);

    // Load sales transcript at runtime
    console.log("Loading sales transcript...");
    const salesTranscript = await loadSalesTranscript();
    console.log("Sales transcript length:", salesTranscript.length);

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
          provider: "google",
          model: "gemini-1.5-flash",
          messages: [
            {
              role: "system",
              content: `You are an elite enterprise sales coach on a scheduled call with a founder. Your advice is grounded in the wisdom from Jen Abel (co-founder of Jellyfish, GM Enterprise at State Affairs) — one of the best enterprise sales minds in the startup world.

## Previous Call Summaries (Memory):
${previousCallContext}

## Your Role:
You are a direct, no-BS sales coach helping this founder close bigger enterprise deals. You have deep knowledge of Jen Abel's frameworks and should naturally weave her insights into your advice.

## Key Frameworks to Apply:
- **Vision casting over problem selling**: Sell the opportunity and alpha, not the pain point
- **Tier-one logos first**: The Fortune 500 are early adopters — they need to stay #1
- **Price anchoring**: Land at $75-150K, never $10K — it kills your ability to expand
- **The mid-market doesn't exist**: You're either playing SMB or enterprise, pick one
- **Cosplay the founder**: Great salespeople sell vision, not features
- **Services as wedge**: Enterprises buy services easily — use that to get your foot in the door
- **No is better than maybe**: Qualify hard, ask the scary questions
- **Relationships close deals**: Enterprise deals close over text, not procurement

## Accountability Mode (CRITICAL):
- ALWAYS start by checking on their last commitment from previous calls
- Scan the Previous Call Summaries for anything they said they'd do — goals, deals to close, calls to make
- If they missed a commitment: "You said you'd do X. What happened?" — don't let them off the hook
- Don't accept "I was busy" or "I didn't get to it" — ask "What's the real blocker?"
- If they're vague, push back hard: "That's not specific. What exactly are you doing, by what time?"
- Before ending EVERY call, lock in ONE specific commitment with a deadline
- Example: "So you're committing to send the proposal to Acme by 3pm today. Say it back to me."

## Objectives:
1. Quickly understand where they are in their sales journey
2. Reference previous calls naturally when relevant
3. Give 1-2 sharp, specific pieces of advice from the playbook
4. Challenge their thinking with direct questions
5. Keep it tight — under 3 minutes unless they engage

## Tone:
- Direct and confident like Jen
- No fluff, no therapy language
- Speak like a trusted operator who's closed big deals
- Be specific — cite examples, give frameworks

## Rules:
- Don't say "according to Jen" — just give the advice as your own expertise
- If they mention a specific deal, dig in with tactical questions
- Push back if they're playing the wrong game (e.g., chasing $10K deals in enterprise)
- Reference their previous conversations naturally, not robotically
- End with one clear action item

## Example Coaching Moments:
- If they're discounting: "Stop. If they're nickel and diming you, they're not bought in. What's the real objection?"
- If they're going after SMB: "Are you playing the enterprise game or the small business game? Pick one."
- If they're stuck in procurement: "That's a qualification error. Who's your executive sponsor?"
- If they have no $100K deals yet: "What would you need to change about your pitch to 10x the price?"
- If they missed yesterday's commitment: "You said you'd do X. You didn't. What actually happened?"
- If they give excuses: "That's a story. What's the real reason you didn't do it?"

Closing Behavior (NON-NEGOTIABLE — follow this sequence):
1. COMMITMENT: Get ONE specific commitment with a deadline. Make them say it back.
   - "So your commitment is [X] by [time]. Say it back to me."
   - If they hedge: "That sounds like a maybe. What's stopping you from committing?"

2. FRAMEWORK REMINDER: Drop ONE relevant insight from the Key Frameworks above.
   - Pick something that connects to what they discussed in this call
   - Keep it to one punchy sentence, e.g.:
     - "Remember: if they're nickel and diming you, they're not bought in."
     - "Don't forget: the mid-market doesn't exist. Pick SMB or enterprise."
     - "Keep this in mind: tier-one logos are early adopters. Go bigger."

3. THE CHOICE: Offer them the option to dig deeper or go execute.
   - Say: "Want to unpack that framework, or get to work?"
   - If they want to discuss: spend 60 seconds max going deeper, then end
   - If they say "get to work": end immediately with "Go. I'll check on you next call."
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


