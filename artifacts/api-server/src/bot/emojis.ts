/**
 * Premium Telegram custom emojis using CONFIRMED valid emoji IDs extracted
 * from the user's own raw Telegram message data.
 *
 * Format (Bot API 6.6+ HTML parse mode):
 *   <tg-emoji emoji-id="ID">FALLBACK_EMOJI</tg-emoji>
 *
 * The fallback emoji shows for non-premium users.
 * Animated premium version shows for Telegram Premium users.
 *
 * NOTE: Colored button backgrounds are NOT supported by the Telegram Bot API.
 * Buttons always use the default theme color. The colored emoji in button text
 * is the only visual differentiation available.
 */

function e(id: string, fallback: string): string {
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

/**
 * Strip <tg-emoji> tags so the result is safe for inline keyboard button text.
 * Telegram buttons are plain text — they never parse HTML.
 * Usage:  { text: btn(E.lightning) + " Concise Mode", ... }
 */
export function btn(emoji: string): string {
  const m = emoji.match(/<tg-emoji[^>]*>([^<]*)<\/tg-emoji>/);
  return m ? (m[1] ?? emoji) : emoji;
}

export const E = {
  // ── Confirmed IDs from user's raw message data ────────────────────────────
  lightning:   e("5400363978159323684", "⚡"),
  sparkles:    e("5287441887718838295", "✨"),
  star:        e("5370784581341422520", "⭐"),
  glowstar:    e("5330194932781050507", "🌟"),
  shield:      e("5352888345972187597", "🛡"),
  diamond:     e("5462902520215002477", "💎"),
  diamond2:    e("5850479475652824718", "💎"),
  trophy:      e("5399852280050646232", "🏆"),
  redcircle:   e("5398065874303220590", "🔴"),
  bluecircle:  e("5253790350803228534", "🔵"),
  globe:       e("5287292843763713628", "🌐"),
  thumbsup:    e("5431676840957724997", "👍"),
  explosion:   e("5219901967916084166", "💥"),
  gun:         e("5326065523589416704", "🔫"),
  eyes:        e("5390884053329146510", "👀"),
  clap:        e("5391115556361370746", "👏"),
  handshake:   e("5393514467394875868", "🤝"),
  zap2:        e("6276168523471393020", "⚡"),
  skull2:      e("5253593529631922134", "💀"),
  scared:      e("5465264391450536996", "😱"),

  // ── Standard Unicode for emojis without confirmed IDs ────────────────────
  fire:        "🔥",
  skull:       "💀",
  lock:        "🔒",
  brain:       "🧠",
  rocket:      "🚀",
  crown:       "👑",
  wrench:      "🔧",
  key:         "🔑",
  magnify:     "🔍",
  target:      "🎯",
  bomb:        "💣",
  chip:        "💻",
  satellite:   "📡",
  alert:       "🚨",
  terminal:    "💻",
  radioactive: "☢️",
  bug:         "👾",
  eye:         "👁",
  robot:       "🤖",
  sword:       "⚔",
  check:       "✅",
  cross:       "❌",
  warning:     "⚠️",
  ban:         "⛔",
  trash:       "🗑",
  admin:       "👤",
  stats:       "📊",
  broadcast:   "📢",
  chart:       "📈",
  infinity:    "♾",
  greencircle: "🟢",
};
