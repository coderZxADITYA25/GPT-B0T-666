import OpenAI from "openai";
import Groq from "groq-sdk";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { getSession, addMessage } from "./session.js";
import { logger } from "../lib/logger.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = process.env.OPENROUTER_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" })
  : null;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const GEMINI_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const CONCISE_SUFFIX =
  "\n\nRespond concisely and directly. Limit to essential information only.";

// ── Provider key status (for /status command) ────────────────────────────────
export function getProviderStatus() {
  return {
    groq:   !!process.env.GROQ_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openai: !!process.env.OPENROUTER_API_KEY,
  };
}

// ── Live ping (for /ping command) ────────────────────────────────────────────
export interface PingResult {
  name: string;
  configured: boolean;
  ok: boolean;
  ms: number | null;
  error?: string;
}

export async function pingProviders(): Promise<PingResult[]> {
  const PING_MSG = "Reply with exactly one word: PONG";
  const results: PingResult[] = [];

  // Ping Gemini — try gemini-flash-latest, gemini-2.0-flash, gemini-1.5-flash
  if (!gemini) {
    results.push({ name: "Gemini", configured: false, ok: false, ms: null, error: "Not configured" });
  } else {
    const t = Date.now();
    const geminiModels = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-1.5-flash"];
    let geminiOk = false;
    let geminiError = "";
    let usedModel = geminiModels[0]!;
    for (const modelName of geminiModels) {
      try {
        const model = gemini.getGenerativeModel({ model: modelName });
        const res = await model.generateContent(PING_MSG);
        const text = res.response.text();
        if (text) { usedModel = modelName; geminiOk = true; break; }
      } catch (err: unknown) {
        const e = err as { message?: string };
        geminiError = e.message ?? "Unknown error";
      }
    }
    if (geminiOk) {
      results.push({ name: `Gemini (${usedModel})`, configured: true, ok: true, ms: Date.now() - t });
    } else {
      results.push({ name: "Gemini", configured: true, ok: false, ms: Date.now() - t, error: geminiError.slice(0, 120) });
    }
  }

  // Ping Groq
  if (!groq) {
    results.push({ name: "Groq Llama-3.3", configured: false, ok: false, ms: null, error: "Not configured" });
  } else {
    const t = Date.now();
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        max_tokens: 5,
        messages: [{ role: "user", content: PING_MSG }],
      });
      const text = res.choices[0]?.message?.content ?? "";
      results.push({ name: "Groq Llama-3.3", configured: true, ok: !!text, ms: Date.now() - t });
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      const isRate = e?.status === 429;
      results.push({
        name: "Groq Llama-3.3", configured: true, ok: false, ms: Date.now() - t,
        error: isRate ? "Rate limited (wait 60s)" : e.message?.slice(0, 60),
      });
    }
  }

  // Ping OpenAI
  if (!openai) {
    results.push({ name: "OpenRouter GPT-4o", configured: false, ok: false, ms: null, error: "Not configured" });
  } else {
    const t = Date.now();
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 5,
        messages: [{ role: "user", content: PING_MSG }],
      });
      const text = res.choices[0]?.message?.content ?? "";
      results.push({ name: "OpenRouter GPT-4o", configured: true, ok: !!text, ms: Date.now() - t });
    } catch (err: unknown) {
      const e = err as { message?: string };
      results.push({ name: "OpenRouter GPT-4o", configured: true, ok: false, ms: Date.now() - t, error: e.message?.slice(0, 60) });
    }
  }

  return results;
}

// ── Silent retry helper ───────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    const isRateLimit =
      e?.status === 429 ||
      e?.message?.toLowerCase().includes("rate") ||
      e?.message?.toLowerCase().includes("quota");
    if (isRateLimit) {
      logger.warn("Rate limit hit — waiting 5s then retrying once...");
      await sleep(5000);
      return await fn();
    }
    throw err;
  }
}

// ── Provider functions ────────────────────────────────────────────────────────

async function tryGroq(
  messages: ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<string> {
  if (!groq) throw new Error("Groq not configured");
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: maxTokens,
    messages: messages as Parameters<typeof groq.chat.completions.create>[0]["messages"],
  });
  const content = response.choices[0]?.message?.content ?? "";
  if (
    content.includes("I cannot") ||
    content.includes("I can't assist") ||
    content.includes("I'm unable to") ||
    content.includes("I won't") ||
    content.includes("against my") ||
    content.includes("I must decline") ||
    content.includes("I apologize, but I")
  ) {
    throw new Error("Groq refused: " + content.slice(0, 80));
  }
  return content;
}

async function tryGemini(
  systemPrompt: string,
  history: ChatCompletionMessageParam[],
  lastUserMsg: string,
): Promise<string> {
  if (!gemini) throw new Error("Gemini not configured");
    const geminiModels = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-1.5-flash"];
  const geminiHistory = history.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content as string }],
  }));
  let lastErr: unknown;
  for (const modelName of geminiModels) {
    try {
      const model = gemini.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        safetySettings: GEMINI_SAFETY_SETTINGS,
      });
      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(lastUserMsg);
      const content = result.response.text();
      if (content) return content;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Gemini returned empty response");
}

async function tryOpenAI(
  messages: ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<string> {
  if (!openai) throw new Error("OpenAI not configured");
  const response = await openai.chat.completions.create({
    model: "openai/gpt-4o",
    max_tokens: maxTokens,
    messages,
  });
  const content = response.choices[0]?.message?.content ?? "";
  if (!content) throw new Error("OpenAI returned empty response");
  return content;
}

// ── Main export ───────────────────────────────────────────────────────────────

export type AIProvider = "openai" | "groq" | "gemini";

export async function askAI(
  userId: number,
  userMessage: string,
  contextPrefix?: string,
): Promise<{ reply: string; provider: AIProvider }> {
  const session = getSession(userId);

  const fullUserMessage = contextPrefix
    ? `${contextPrefix}\n\n${userMessage}`
    : userMessage;

  addMessage(userId, "user", fullUserMessage);

  const systemContent =
    session.mode === "concise"
      ? SYSTEM_PROMPT + CONCISE_SUFFIX
      : SYSTEM_PROMPT;

  // Reduced from 8000 → 1500 to stay within Groq free tier (6000 TPM)
  const maxTokens = session.mode === "concise" ? 512 : 1500;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...session.messages,
  ];

  // Gemini first (1M free tokens/min) → Groq → OpenAI
  const providers: Array<{ name: AIProvider; fn: () => Promise<string> }> = [
    { name: "gemini", fn: () => tryGemini(systemContent, session.messages, fullUserMessage) },
    { name: "groq",   fn: () => tryGroq(messages, maxTokens) },
    { name: "openai", fn: () => tryOpenAI(messages, maxTokens) },
  ];

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const reply = await withRetry(provider.fn);
      if (reply) {
        addMessage(userId, "assistant", reply);
        return { reply, provider: provider.name };
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      logger.warn(
        { provider: provider.name, status: e.status, msg: e.message },
        "AI provider failed after retry, trying next",
      );
      lastError = err;
    }
  }

  const e = lastError as { status?: number; message?: string };
  const isRateLimit =
    e?.status === 429 ||
    e?.message?.toLowerCase().includes("rate") ||
    e?.message?.toLowerCase().includes("quota");
  logger.error({ lastError }, "All AI providers failed");
  return {
    reply: isRateLimit
      ? "⏳ All providers are rate-limited. Please wait 60 seconds and try again."
      : "⚠️ All AI providers are currently unavailable. Please try again in a moment.",
    provider: "groq",
  };
}

  
