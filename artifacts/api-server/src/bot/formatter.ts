/**
 * Converts AI markdown output to Telegram HTML parse_mode.
 * IMPORTANT: <tg-emoji> tags must pass through untouched — do not escape them.
 */
export function formatForTelegram(text: string): string {
  let result = text;

  // Extract and protect <tg-emoji> tags before any processing
  const tgEmojiPlaceholders: string[] = [];
  result = result.replace(/<tg-emoji emoji-id="[^"]*">[^<]*<\/tg-emoji>/g, (match) => {
    tgEmojiPlaceholders.push(match);
    return `\x00TGEMOJI${tgEmojiPlaceholders.length - 1}\x00`;
  });

  // Convert ```lang\ncode\n``` blocks to <pre><code> — escape content inside
  result = result.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_match, _lang, code) => {
      const escaped = escapeHtml(code.trim());
      return `<pre><code>${escaped}</code></pre>`;
    },
  );

  // Inline code `...` — escape content inside
  result = result.replace(/`([^`\n]+)`/g, (_m, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // Bold **text**
  result = result.replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>");

  // Italic *text* (single asterisk, not touching bold)
  result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<i>$1</i>");

  // ### Headers → bold
  result = result.replace(/^#{1,3} (.+)$/gm, "<b>$1</b>");

  // Blockquote: lines starting with > 
  result = result.replace(/^((?:&gt;[^\n]*\n?)+)/gm, (_m, block) => {
    const inner = block.replace(/^&gt; ?/gm, "").trim();
    return `<blockquote>${inner}</blockquote>\n`;
  });
  // Also handle raw > lines (before escaping — they get escaped, so handle &gt; above)
  result = result.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // Restore <tg-emoji> tags
  result = result.replace(/\x00TGEMOJI(\d+)\x00/g, (_, idx) => {
    return tgEmojiPlaceholders[parseInt(idx)] ?? "";
  });

  // Escape any bare < or > that are NOT part of our safe Telegram HTML tag set
  result = escapeBareAngles(result);

  return result;
}

/**
 * Escape angle brackets that are not part of known safe Telegram HTML tags.
 */
function escapeBareAngles(html: string): string {
  return html.replace(/<\/?(?:b|i|code|pre|blockquote|tg-emoji(?:\s[^>]*)?)>|<([^>]*)>/g, (match, badTag) => {
    if (badTag === undefined) return match; // safe tag — keep it
    return `&lt;${badTag}&gt;`;             // unknown tag — escape it
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Strip all HTML tags, returning plain text safe to send without parse_mode. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const MAX = 3900; // stay safely under Telegram's 4096 limit

/**
 * Split a long HTML message into chunks ≤ MAX chars.
 * - Never cuts a <pre><code> block mid-line (splits at newlines inside the block)
 * - Closes open <b>/<i> tags at boundaries and reopens in next chunk
 * - Handles code blocks that are themselves larger than MAX
 */
export function splitMessage(text: string, maxLen = MAX): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    const preOpen  = remaining.indexOf("<pre><code>");
    const preClose = remaining.indexOf("</code></pre>");

    let splitAt: number;

    if (preOpen !== -1 && preOpen < maxLen) {
      if (preClose !== -1 && preClose + 13 <= maxLen) {
        // Entire <pre> block fits before maxLen — split after it
        splitAt = preClose + 13; // length of "</code></pre>"
      } else if (preOpen > 0) {
        // <pre> starts before maxLen but doesn't close before it — split before the <pre>
        const nlBefore = remaining.lastIndexOf("\n", preOpen);
        splitAt = nlBefore > 0 ? nlBefore : preOpen;
      } else {
        // <pre> starts at position 0 and is larger than maxLen — split inside it at a newline
        const contentStart = "<pre><code>".length;
        const nlInside = remaining.lastIndexOf("\n", maxLen - 14); // leave room for closing tags
        splitAt = nlInside > contentStart ? nlInside : maxLen - 14;
        // Build a chunk that is a valid self-contained code block
        const codeChunk = remaining.slice(0, splitAt);
        const fullChunk = codeChunk.endsWith("</code></pre>")
          ? codeChunk
          : codeChunk + "\n</code></pre>";
        chunks.push(fullChunk);
        // Resume next chunk inside a new code block
        remaining = "<pre><code>" + remaining.slice(splitAt).trimStart();
        continue;
      }
    } else {
      // No <pre> crossing — split at last newline before maxLen
      splitAt = remaining.lastIndexOf("\n", maxLen);
      if (splitAt < maxLen / 2) splitAt = maxLen;
    }

    let chunk = remaining.slice(0, splitAt);

    // Close any open inline tags at the boundary
    const openTags = getUnclosedTags(chunk);
    for (const tag of [...openTags].reverse()) chunk += `</${tag}>`;

    chunks.push(chunk);
    remaining = remaining.slice(splitAt).trimStart();

    // Reopen closed tags at the start of next chunk
    for (const tag of openTags) remaining = `<${tag}>` + remaining;
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/** Returns list of tag names that are open but not yet closed in the given HTML snippet. */
function getUnclosedTags(html: string): string[] {
  const stack: string[] = [];
  const tagRe = /<(\/)?(b|i|code|pre|blockquote)(?:\s[^>]*)?\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const closing = m[1];
    const tag = m[2].toLowerCase();
    if (!closing) {
      stack.push(tag);
    } else {
      const idx = stack.lastIndexOf(tag);
      if (idx !== -1) stack.splice(idx, 1);
    }
  }
  return stack;
}
