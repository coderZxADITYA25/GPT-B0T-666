/**
 * Extracts code blocks from AI responses and packages them as downloadable files.
 * Supports all languages the AI can generate.
 */

export interface CodeFile {
  filename: string;
  language: string;
  code: string;
  buffer: Buffer;
}

/** Map from language tag → file extension */
const LANG_EXT: Record<string, string> = {
  // Systems
  c:           "c",
  cpp:         "cpp",
  "c++":       "cpp",
  csharp:      "cs",
  "c#":        "cs",
  cs:          "cs",
  rust:        "rs",
  go:          "go",
  swift:       "swift",
  kotlin:      "kt",
  java:        "java",
  // Scripting
  python:      "py",
  py:          "py",
  bash:        "sh",
  sh:          "sh",
  shell:       "sh",
  powershell:  "ps1",
  ps1:         "ps1",
  perl:        "pl",
  ruby:        "rb",
  lua:         "lua",
  // Web
  javascript:  "js",
  js:          "js",
  typescript:  "ts",
  ts:          "ts",
  html:        "html",
  css:         "css",
  php:         "php",
  // Data / Config
  json:        "json",
  yaml:        "yaml",
  yml:         "yml",
  toml:        "toml",
  xml:         "xml",
  sql:         "sql",
  // Markup / Docs
  markdown:    "md",
  md:          "md",
  // Low-level
  asm:         "asm",
  assembly:    "asm",
  nasm:        "asm",
  masm:        "asm",
  // Misc
  dockerfile:  "dockerfile",
  makefile:    "makefile",
  r:           "r",
  matlab:      "m",
  haskell:     "hs",
  dart:        "dart",
  solidity:    "sol",
  vb:          "vb",
  vbnet:       "vb",
  scala:       "scala",
  nim:         "nim",
  zig:         "zig",
  julia:       "jl",
  apex:        "apex",
  // Catch-all
  text:        "txt",
  txt:         "txt",
  plaintext:   "txt",
};

/** Determine the file extension for a language tag */
function getExtension(lang: string): string {
  return LANG_EXT[lang.toLowerCase().trim()] ?? "txt";
}

/** Extract all ```lang ... ``` code blocks from AI response text */
export function extractCodeFiles(text: string): CodeFile[] {
  const blocks: CodeFile[] = [];
  const langCount: Record<string, number> = {};

  const pattern = /```(\w[\w+#-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const lang = match[1] ?? "txt";
    const code = match[2]?.trim() ?? "";
    if (!code) continue;

    const ext = getExtension(lang);
    langCount[ext] = (langCount[ext] ?? 0) + 1;
    const count = langCount[ext];
    const filename = count === 1 ? `code.${ext}` : `code_${count}.${ext}`;

    blocks.push({
      filename,
      language: lang,
      code,
      buffer: Buffer.from(code, "utf-8"),
    });
  }

  return blocks;
}

/** Build a JSON file containing all extracted code blocks with metadata */
export function buildJsonBundle(files: CodeFile[]): Buffer {
  const payload = {
    generated_by: "CyberGPT",
    timestamp: new Date().toISOString(),
    total_files: files.length,
    files: files.map((f) => ({
      filename: f.filename,
      language: f.language,
      size_bytes: f.buffer.byteLength,
      code: f.code,
    })),
  };
  return Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
}
