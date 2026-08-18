/**
 * Admin configuration and state management.
 */

export const ADMIN_IDS = new Set<number>([8449138605, 8640978094]);

export function isAdmin(userId: number): boolean {
  return ADMIN_IDS.has(userId);
}

// ── Public mode toggle ────────────────────────────────────────────────────────
// When OFF (default): only admins can use the bot.
// When ON: any Telegram user can use the bot.
let publicModeEnabled = false;

export function isPublicMode(): boolean {
  return publicModeEnabled;
}

export function setPublicMode(enabled: boolean): void {
  publicModeEnabled = enabled;
}

// ── User tracking ─────────────────────────────────────────────────────────────
const botUsers = new Map<number, { username?: string; firstName?: string; lastSeen: number; messageCount: number }>();
const bannedUsers = new Set<number>();
const broadcastLog: Array<{ text: string; sentAt: number; sentBy: number }> = [];
let totalMessages = 0;
let botStartTime = Date.now();

export function trackUser(userId: number, firstName?: string, username?: string): void {
  const existing = botUsers.get(userId);
  if (existing) {
    existing.lastSeen = Date.now();
    existing.messageCount++;
  } else {
    botUsers.set(userId, { username, firstName, lastSeen: Date.now(), messageCount: 1 });
  }
  totalMessages++;
}

export function isBanned(userId: number): boolean {
  return bannedUsers.has(userId);
}

export function banUser(userId: number): boolean {
  if (ADMIN_IDS.has(userId)) return false;
  bannedUsers.add(userId);
  return true;
}

export function unbanUser(userId: number): boolean {
  return bannedUsers.delete(userId);
}

export function getStats(): {
  totalUsers: number;
  activeUsers: number;
  bannedCount: number;
  totalMessages: number;
  uptimeHours: number;
  publicMode: boolean;
} {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const activeUsers = [...botUsers.values()].filter(u => u.lastSeen > oneHourAgo).length;
  return {
    totalUsers: botUsers.size,
    activeUsers,
    bannedCount: bannedUsers.size,
    totalMessages,
    uptimeHours: Math.floor((Date.now() - botStartTime) / 3600000),
    publicMode: publicModeEnabled,
  };
}

export function getAllUserIds(): number[] {
  return [...botUsers.keys()].filter(id => !bannedUsers.has(id));
}

export function logBroadcast(text: string, sentBy: number): void {
  broadcastLog.push({ text, sentAt: Date.now(), sentBy });
  if (broadcastLog.length > 50) broadcastLog.shift();
}

export function getRecentBroadcasts(): typeof broadcastLog {
  return broadcastLog.slice(-5);
}

  // ── Conversation log ─────────────────────────────────────────────────────────
  export interface ConversationEntry {
    userId: number;
    firstName?: string;
    username?: string;
    question: string;
    answer: string;
    provider: string;
    timestamp: number;
  }

  const conversationLogs: ConversationEntry[] = [];
  const MAX_LOGS = 200;

  export function logConversation(
    userId: number,
    question: string,
    answer: string,
    provider: string,
  ): void {
    const user = botUsers.get(userId);
    conversationLogs.push({
      userId,
      firstName: user?.firstName,
      username: user?.username,
      question,
      answer,
      provider,
      timestamp: Date.now(),
    });
    if (conversationLogs.length > MAX_LOGS) conversationLogs.shift();
  }

  export function getConversationLogs(limit = 10): ConversationEntry[] {
    return conversationLogs.slice(-limit).reverse();
  }

  export function getUserLogs(userId: number): ConversationEntry[] {
    return conversationLogs.filter(e => e.userId === userId).slice(-20).reverse();
  }

  export function getAllUsersDetailed(): Array<{
    id: number;
    firstName?: string;
    username?: string;
    messageCount: number;
    lastSeen: number;
    banned: boolean;
  }> {
    return [...botUsers.entries()].map(([id, u]) => ({
      id,
      firstName: u.firstName,
      username: u.username,
      messageCount: u.messageCount,
      lastSeen: u.lastSeen,
      banned: bannedUsers.has(id),
    })).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  
