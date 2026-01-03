import { NextRequest, NextResponse } from "next/server";
import { VapiClient } from "@vapi-ai/server-sdk";
import { promises as fs } from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";

const VAPI_PHONE_NUMBER_ID = "e4511439-4772-4b31-ae08-1bc1f8a7ca5a";
const VOICE_ID = "AMagyyApPEVuxcHAR8xR";
const MAX_PREVIOUS_CALLS = 5; // Number of previous calls to fetch for context

// Slot definitions with prompts for each time of day
const SLOT_PROMPTS: Record<string, string> = {
  morning:
    "Morning. What's the ONE commitment you're making today? Be specific.",
  noon: "Check-in. This morning you committed to something. Did you do it?",
  evening:
    "End of day. Did you hit your commitment or not? No excuses, just facts.",
};

async function loadSalesTranscript(): Promise<string> {
  try {
    const transcriptPath = path.join(
      process.cwd(),
      "app",
      "Jen_abel_1-10M.txt"
    );
    const content = await fs.readFile(transcriptPath, "utf-8");
    return content;
  } catch (error) {
    console.error("Error loading sales transcript:", error);
    return "";
  }
}

async function loadGeneralQuotes(): Promise<string[]> {
  try {
    const quotesPath = path.join(process.cwd(), "app", "generals-quotes.json");
    const content = await fs.readFile(quotesPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("Error loading general quotes:", error);
    return ["Victory belongs to the most persevering. - Napoleon Bonaparte"]; // Fallback
  }
}

async function extractCommitment(transcript: string): Promise<string> {
  try {
    const apiKey = process.env.GOOGLE_KEY;
    if (!apiKey) {
      console.error("GOOGLE_KEY not set, returning raw transcript");
      return transcript;
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Read this call transcript and extract ONLY the user's (Kazi's) commitment. Return just the commitment as a short, direct statement (1-2 sentences max). Focus on what they said they would do and by when. Ignore everything the AI coach said.

Call Transcript:
${transcript}

User's Commitment (short and direct):`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const commitment = response.text?.trim() || transcript;

    console.log(transcript);

    console.log("Extracted commitment:", commitment);
    return commitment;
  } catch (error) {
    console.error("Error extracting commitment with Gemini:", error);
    return transcript; // Fallback to raw transcript
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

interface CallsBySlot {
  morning?: string;
  noon?: string;
  evening?: string;
}

async function fetchPreviousCallSummaries(
  vapi: VapiClient
): Promise<CallsBySlot> {
  try {
    // Fetch recent calls, sorted by most recent first
    const calls = (await vapi.calls.list()).reverse();

    // Get today's date components in America/New_York timezone
    const now = new Date();
    const todayYear = Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
    }).format(now));
    const todayMonth = Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "numeric",
    }).format(now));
    const todayDay = Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      day: "numeric",
    }).format(now));

    console.log(`Today (ET): ${todayYear}-${todayMonth}-${todayDay}`);

    const callsBySlot: CallsBySlot = {};

    for (const call of calls) {
      // @ts-ignore - transcript field exists at runtime
      const transcript = call.artifact?.transcript;
      // @ts-ignore - metadata.slot exists at runtime
      const slot = call.assistant?.metadata?.slot;

      console.log("metadata", call.assistant?.metadata);

      console.log("transcript", transcript);
      console.log("slot", slot);
      console.log("call.createdAt", call.createdAt);

      if (transcript && slot && call.createdAt) {
        const callDate = new Date(call.createdAt);
        
        const callYear = Number(new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          year: "numeric",
        }).format(callDate));
        const callMonth = Number(new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          month: "numeric",
        }).format(callDate));
        const callDay = Number(new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          day: "numeric",
        }).format(callDate));

        console.log(`Call [${slot}]: ${callYear}-${callMonth}-${callDay}`);

        // Check if same day
        const isSameDay = callYear === todayYear && callMonth === todayMonth && callDay === todayDay;

        if (isSameDay) {
          console.log(`✓ Including ${slot} call`);
          // Map by slot metadata
          if (slot === "morning" && !callsBySlot.morning) {
            callsBySlot.morning = transcript;
          } else if (slot === "noon" && !callsBySlot.noon) {
            callsBySlot.noon = transcript;
          } else if (slot === "evening" && !callsBySlot.evening) {
            callsBySlot.evening = transcript;
          }
        }
      }
    }

    console.log("Calls found:", Object.keys(callsBySlot));
    return callsBySlot;
  } catch (error) {
    console.error("Error fetching previous calls:", error);
    return {};
  }
}

export async function GET(request: NextRequest) {
  var slot = calculateSlot();

  console.log("slot", slot);

  // Validate slot parameter
  if (!slot || !SLOT_PROMPTS[slot]) {
    slot = "noon";
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

    // Fetch previous call transcripts for context (same day only)
    console.log("Fetching previous call transcripts from today...");
    const callsBySlot = await fetchPreviousCallSummaries(vapi);
    console.log("Calls by slot:", Object.keys(callsBySlot));

    // Format the previous calls context
    const previousCallContext =
      Object.entries(callsBySlot)
        .map(
          ([slotName, summary]) => `**${slotName.toUpperCase()}**: ${summary}`
        )
        .join("\n\n") || "No previous calls from today.";

    // Load general quotes and pick one for evening calls
    let generalQuote = "";
    if (slot === "evening") {
      const quotes = await loadGeneralQuotes();
      generalQuote = quotes[Math.floor(Math.random() * quotes.length)];
      console.log("Selected general quote:", generalQuote);
    }

    // Build dynamic first message based on slot and context
    let firstMessage = SLOT_PROMPTS[slot];
    if (slot === "noon" && callsBySlot.morning) {
      // Extract just the commitment from the morning call
      const commitment = await extractCommitment(callsBySlot.morning);
      firstMessage = `Check-in. This morning you said: "${commitment}". Did you do it?`;
    } else if (slot === "evening" && callsBySlot.morning) {
      // Extract just the commitment from the morning call
      const commitment = await extractCommitment(callsBySlot.morning);
      firstMessage = `End of day. This morning you committed: "${commitment}". Did you hit it?`;
    }

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
        firstMessage: firstMessage,
        transcriber: {
          provider: "deepgram",
        },
        metadata: {
          slot: slot,
        },
        endCallPhrases: [
          "Go.",
          "Go",
          "Get to work.",
          "Get to work",
          "Go execute.",
          "Go execute",
          "I'll check on you next call.",
          "I'll check on you next call",
          "Talk to you next time.",
          "Talk to you next time",
          "We're done.",
          "We're done",
          "That's it.",
          "That's it",
          "Good. Go.",
          "Alright. Go.",
          "Got it. Go.",
          "Perfect. Go.",
          "Go do it.",
          "Go do it",
          "Get after it.",
          "Get after it",
        ],
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are an elite enterprise sales coach on a scheduled call with a founder. Your advice is grounded in the wisdom from Jen Abel (co-founder of Jellyfish, GM Enterprise at State Affairs) — one of the best enterprise sales minds in the startup world.

## Previous Call Summaries (Today Only):
${previousCallContext}

## Current Call Type: ${slot.toUpperCase()}
${
  slot === "noon"
    ? `**NOON CHECK-IN PROTOCOL:**
${
  callsBySlot.morning
    ? `- The MORNING call summary is above - reference what they committed to
- Start by checking: "This morning you committed to [X]. Did you do it?"`
    : `- No morning call found today - ask where they are now`
}
- If they did it: "Good." Then move to quick coaching if needed
- If they didn't: Get the real blocker, give sharp advice
- Get a NEW commitment for the rest of today`
    : slot === "evening"
    ? `**EVENING WRAP-UP PROTOCOL:**
${
  callsBySlot.morning
    ? `- The MORNING call summary is above - reference their original commitment
- Check on it: "This morning you committed to [X]. Did you do it?"`
    : `- No morning call found - ask how the day went overall`
}
- GIVE A SCORE: Rate their day 1-10 based on execution
- POINTERS FOR TOMORROW: Give 1-2 specific tactical things to do differently tomorrow
- END WITH A GENERAL'S QUOTE: "${generalQuote}"
- Then get their commitment for tomorrow morning`
    : `**MORNING START PROTOCOL:**
- Get their ONE commitment for today
- Be specific about what and by when
- This sets the baseline for noon and evening check-ins`
}

## Your Role:
You are a direct, no-BS sales coach helping this founder close bigger enterprise deals. You have deep knowledge of Jen Abel's frameworks and should naturally weave her insights into your advice.

## Who You're Coaching:
You're always speaking to **Kazi**, the founder of **Thred AI** (thred.ai).

**About Kazi & Thred:**
- Kazi is responsible for customer growth and investors
- Thred AI is a buyer intelligence platform for ChatGPT
- They're selling to enterprises who use ChatGPT and need buyer intelligence
- Target buyers: Enterprise AI/ML teams, RevOps, and GTM leaders
- This is a technical product for sophisticated buyers

**How to use this context:**
- Reference Thred naturally when giving advice ("For a buyer intelligence play like Thred...")
- Don't over-explain what Thred does — Kazi knows the product
- Focus on enterprise sales strategy, not product features
- When relevant, tie advice to investor expectations or growth metrics

## BREVITY IS CRITICAL:
- Keep calls under 2 minutes MAX
- Get to the point immediately
- Give ONE piece of advice, not three
- Don't ramble or over-explain
- If they try to keep talking, cut them off politely: "We're good. Go."
- Resist the urge to add "one more thing"

## END CALL TRIGGER (CRITICAL):
When you're done, you MUST say one of these EXACT phrases to end the call:
- "Go."
- "Get to work."
- "Go execute."

The call will automatically hang up when you say these phrases. DO NOT add anything after them.

## Key Frameworks to Apply:
- **Vision casting over problem selling**: Sell the opportunity and alpha, not the pain point
- **Tier-one logos first**: The Fortune 500 are early adopters — they need to stay #1
- **Price anchoring**: Land at $75-150K, never $10K — it kills your ability to expand
- **The mid-market doesn't exist**: You're either playing SMB or enterprise, pick one
- **Cosplay the founder**: Great salespeople sell vision, not features
- **Services as wedge**: Enterprises buy services easily — use that to get your foot in the door
- **No is better than maybe**: Qualify hard, ask the scary questions
- **Relationships close deals**: Enterprise deals close over text, not procurement

## Call Structure (STRICT):
Total call time: 90-120 seconds MAX

1. Opening (15 sec): Check last commitment OR ask where they are
2. Coaching (30 sec): ONE piece of sharp advice
3. Closing (45 sec): Get commitment → Repeat → Framework → "Go."

DO NOT:
- Have long back-and-forth conversations
- Ask multiple questions
- Give multiple pieces of advice
- Explain things at length
- Respond to "one more thing" or "wait, also..."

## Accountability Mode (CRITICAL):
- If there's a previous commitment, start with: "You said you'd do X. Did you?"
- If they did it: "Good." (15 seconds max, then move to coaching)
- If they didn't: "What happened?" → Get real blocker → Move to coaching
- Don't spend more than 30 seconds on this
- Before ending EVERY call, lock in ONE specific commitment with a deadline

## Objectives:
1. Check on their last commitment (if there is one)
2. Quickly understand where they are NOW
3. Give ONE sharp, specific piece of advice from the playbook
4. Get a new commitment
5. END THE CALL — target under 2 minutes total

## Tone:
- Direct and confident like Jen
- No fluff, no therapy language, no rambling
- Get in, drop wisdom, get out
- Speak like a busy operator who has 10 more calls

## Rules:
- Don't say "according to Jen" — just give the advice
- Don't ask more than 2 questions total in the entire call
- Push back if they're playing the wrong game, but don't lecture
- Reference previous conversations in passing, not robotically
- After you've given advice and gotten a commitment, END THE CALL

## Example Coaching Moments:
- If they're discounting: "Stop. If they're nickel and diming you, they're not bought in. What's the real objection?"
- If they're going after SMB: "Kazi, are you playing the enterprise game or the small business game? Pick one."
- If they're stuck in procurement: "That's a qualification error. Who's your executive sponsor?"
- If they have no $100K deals yet: "What would you need to change about your pitch to 10x the price?"
- If they missed yesterday's commitment: "You said you'd do X. You didn't. What actually happened?"
- If they give excuses: "That's a story. What's the real reason you didn't do it?"
- If they're selling features: "You're not selling buyer intelligence. You're selling alpha. What competitive edge does Thred unlock?"
- If talking to wrong buyers: "Who at that company actually loses if they don't have buyer intelligence? Go find that person."

## Closing Behavior (MUST happen within 90 seconds of call start):

After giving your ONE piece of advice, immediately start closing:

**FOR MORNING & NOON CALLS:**
1. **COMMITMENT**: Get ONE specific commitment with a deadline.
   - "What are you committing to do, and by when?"
   - Wait for their answer. If vague, push once: "Be specific."

2. **REPEAT BACK**: Repeat it back in one sentence.
   - "Got it. You're [their commitment] by [deadline]."

3. **FRAMEWORK TIP**: ONE sentence from Jen's playbook.
   - "Remember: [one framework that applies]."
   - Examples: "If they're nickel and diming you, they're not bought in." / "The mid-market doesn't exist."

4. **END IMMEDIATELY**: Say "Go." or "Get to work." or "Go execute."

**FOR EVENING CALLS (Different Structure):**
1. **SCORE**: Give them a score 1-10 on their execution today.
   - "I'm giving you a [X]/10 today. [Brief reason why]."

2. **POINTERS FOR TOMORROW**: 1-2 specific tactical things.
   - "Tomorrow: [pointer 1]. [pointer 2 if needed]."

3. **COMMITMENT**: Get tomorrow's commitment.
   - "What's your commitment for tomorrow morning?"
   - Repeat it back: "Got it. [their commitment]."

4. **GENERAL'S QUOTE**: Drop the quote (already provided above).
   - Just say it naturally, don't announce "here's a quote"

5. **END IMMEDIATELY**: Say "Go." or "Get to work."

**CRITICAL FOR ALL CALLS:**
- Use the EXACT phrase with period: "Go." or "Get to work." or "Go execute."
- DO NOT add anything after it
- DO NOT say "bye" or "talk soon" 
- The call will automatically end when you say this phrase
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
