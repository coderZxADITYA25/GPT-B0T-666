/**
 * Reads incoming Telegram file uploads and converts them to text
 * so the content can be passed to the AI as context.
 *
 * Supports: code files, scripts, text files, config files.
 * Binary files (EXE, DLL, ZIP…) receive a brief notice to the AI.
 */
import TelegramBot from "node-telegram-bot-api";

const MAX_BYTES = 512 * 1024; // 512 KB hard cap for text reading

/** MIME types we treat as readable text */
const TEXT_MIMES = new Set([
  "text/plain", "text/html", "text/css", "text/javascript",
  "text/x-python", "text/x-c", "text/x-c++", "text/x-csharp",
  "text/x-java-source", "text/x-shellscript", "text/x-sh",
  "text/x-powershell", "text/x-perl", "text/x-ruby",
  "text/x-go", "text/x-rust", "text/x-kotlin", "text/x-swift",
  "text/xml", "text/csv",
  "application/json", "application/xml", "application/x-yaml",
  "application/x-sh", "application/x-shellscript",
  "application/javascript", "application/typescript",
  "application/x-python", "application/x-perl",
  "application/x-ruby",
]);

/** File extensions that are always safe to read as text */
const TEXT_EXTENSIONS = new Set([
  "txt", "py", "js", "ts", "c", "cpp", "cc", "cxx", "h", "hpp",
  "cs", "java", "rb", "go", "rs", "swift", "kt", "kts",
  "php", "pl", "lua", "sh", "bash", "zsh", "fish", "ps1", "psm1",
  "html", "htm", "css", "scss", "sass", "less",
  "json", "yaml", "yml", "toml", "xml", "ini", "cfg", "conf",
  "sql", "md", "markdown", "asm", "s", "nasm",
  "sol", "dart", "zig", "nim", "jl", "r", "m",
  "makefile", "dockerfile", "vagrantfile", "gitignore",
  "log", "csv", "tsv",
]);

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isTextFile(mimeType: string | undefined, filename: string): boolean {
  if (mimeType && TEXT_MIMES.has(mimeType)) return true;
  const ext = getExtension(filename);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Also handle files with no extension that look like scripts
  if (!filename.includes(".")) return false;
  return false;
}

/**
 * Downloads a Telegram file by fileId and returns its text content,
 * or null if the file is binary / too large.
 *
 * Returns a formatted string to inject into the AI prompt as context.
 */
export async function readTelegramFile(
  bot: TelegramBot,
  fileId: string,
  mimeType: string | undefined,
  filename: string,
): Promise<string | null> {
  const ext = getExtension(filename);
  const readable = isTextFile(mimeType, filename);

  if (!readable) {
    return `[User uploaded a binary file: "${filename}" (${mimeType ?? "unknown type"}). Analyze or explain it based on the filename and type.]`;
  }

  try {
    // Get the download URL
    const fileInfo = await bot.getFile(fileId);
    const filePath = fileInfo.file_path;
    if (!filePath) return null;

    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;

    const res = await fetch(url);
    if (!res.ok) return null;

    // Check size before reading
    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BYTES) {
      return `[User uploaded "${filename}" but it is too large (${Math.round(contentLength / 1024)} KB). Summarize what such a file might contain and ask the user to paste the relevant section.]`;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      const truncated = Buffer.from(buffer).slice(0, MAX_BYTES).toString("utf-8");
      return `[User uploaded "${filename}" — content truncated to 512 KB]\n\`\`\`${ext}\n${truncated}\n\`\`\``;
    }

    const content = Buffer.from(buffer).toString("utf-8");
    return `[User uploaded file: "${filename}"]\n\`\`\`${ext}\n${content}\n\`\`\``;
  } catch {
    return null;
  }
}
