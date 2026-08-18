import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

interface UserSession {
  messages: ChatCompletionMessageParam[];
  mode: "detailed" | "concise";
  lastActive: number;
  lastBotMessageId?: number;
  lastUserMessageId?: number;
}

const sessions = new Map<number, UserSession>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function getSession(userId: number): UserSession {
  const existing = sessions.get(userId);
  if (existing) {
    existing.lastActive = Date.now();
    return existing;
  }
  const session: UserSession = {
    messages: [],
    mode: "detailed",
    lastActive: Date.now(),
  };
  sessions.set(userId, session);
  return session;
}

export function clearSession(userId: number): void {
  sessions.delete(userId);
}

export function setMode(userId: number, mode: "detailed" | "concise"): void {
  const session = getSession(userId);
  session.mode = mode;
}

export function setLastBotMessage(userId: number, messageId: number): void {
  const session = getSession(userId);
  session.lastBotMessageId = messageId;
}

export function getLastBotMessageId(userId: number): number | undefined {
  return sessions.get(userId)?.lastBotMessageId;
}

export function addMessage(
  userId: number,
  role: "user" | "assistant",
  content: string,
): void {
  const session = getSession(userId);
  session.messages.push({ role, content });
  // Keep last 40 messages to avoid token overflow
  if (session.messages.length > 40) {
    session.messages = session.messages.slice(-40);
  }
}

// Cleanup stale sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessions.entries()) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(userId);
    }
  }
}, 30 * 60 * 1000);
