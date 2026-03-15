import DOMPurify from "dompurify";
import { marked } from "marked";
import { truncateText } from "./format.ts";

const allowedTags = [
  "a",
  "b",
  "blockquote",
  "br",
  "button",
  "code",
  "del",
  "details",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "summary",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
  "img",
];

const allowedAttrs = [
  "class",
  "href",
  "rel",
  "target",
  "title",
  "start",
  "src",
  "alt",
  "data-code",
  "type",
  "aria-label",
];
const sanitizeOptions = {
  ALLOWED_TAGS: allowedTags,
  ALLOWED_ATTR: allowedAttrs,
  ADD_DATA_URI_TAGS: ["img"],
};

let hooksInstalled = false;
const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;
const INLINE_DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
const markdownCache = new Map<string, string>();
const TAIL_LINK_BLUR_CLASS = "chat-link-tail-blur";

function getCachedMarkdown(key: string): string | null {
  const cached = markdownCache.get(key);
  if (cached === undefined) {
    return null;
  }
  markdownCache.delete(key);
  markdownCache.set(key, cached);
  return cached;
}

function setCachedMarkdown(key: string, value: string) {
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) {
    return;
  }
  const oldest = markdownCache.keys().next().value;
  if (oldest) {
    markdownCache.delete(oldest);
  }
}

function installHooks() {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) {
      return;
    }
    const href = node.getAttribute("href");
    if (!href) {
      return;
    }
    node.setAttribute("rel", "noreferrer noopener");
    node.setAttribute("target", "_blank");
    if (href.toLowerCase().includes("tail")) {
      node.classList.add(TAIL_LINK_BLUR_CLASS);
    }
  });
}

/** Keys that identify a "delegation" row (agent + task description). */
const DELEGATION_AGENT_KEYS = ["agentId", "agent", "assignee", "owner"];
const DELEGATION_TASK_KEYS = ["subtask", "task", "description", "prompt", "instruction"];

function isDelegationRow(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }
  const o = obj as Record<string, unknown>;
  const hasAgent = DELEGATION_AGENT_KEYS.some((k) => typeof o[k] === "string");
  const hasTask = DELEGATION_TASK_KEYS.some((k) => typeof o[k] === "string");
  return hasAgent && hasTask;
}

function getAgentLabel(obj: Record<string, unknown>): string {
  for (const k of DELEGATION_AGENT_KEYS) {
    const v = obj[k];
    if (typeof v === "string") {
      return v;
    }
  }
  return "—";
}

function getTaskLabel(obj: Record<string, unknown>): string {
  for (const k of DELEGATION_TASK_KEYS) {
    const v = obj[k];
    if (typeof v === "string") {
      return v;
    }
  }
  return "—";
}

/** Convert JSON delegation arrays (e.g. agentId + subtask) into readable markdown. */
function jsonToDelegationMarkdown(data: unknown): string | null {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  const rows = data.filter(isDelegationRow);
  if (rows.length === 0) {
    return null;
  }
  const header = "| Agent | Task |";
  const sep = "| --- | --- |";
  const body = rows
    .map((r) => {
      const agent = getAgentLabel(r).replace(/\|/g, "\\|");
      const task = getTaskLabel(r).replace(/\n/g, " ").replace(/\|/g, "\\|");
      return `| ${agent} | ${task} |`;
    })
    .join("\n");
  return "### Delegation plan\n\n" + header + "\n" + sep + "\n" + body;
}

/** If content is generic JSON array/object, try to render as a readable structure. */
function jsonToStructuredMarkdown(data: unknown): string | null {
  if (Array.isArray(data)) {
    const asDelegation = jsonToDelegationMarkdown(data);
    if (asDelegation) {
      return asDelegation;
    }
    // Fallback: array of primitives or mixed
    if (data.length <= 20 && data.every((x) => typeof x === "string" || typeof x === "number")) {
      const list = data.map((x) => `- ${String(x)}`).join("\n");
      return "### Items\n\n" + list;
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const entries = Object.entries(o).filter(([, v]) => v !== undefined && v !== null);
    if (
      entries.length <= 15 &&
      entries.every(
        ([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
      )
    ) {
      const rows = entries.map(
        ([k, v]) => `| **${k.replace(/\|/g, "\\|")}** | ${String(v).replace(/\|/g, "\\|")} |`,
      );
      return "### Details\n\n| Field | Value |\n| --- | --- |\n" + rows.join("\n");
    }
  }
  return null;
}

/**
 * Preprocess execution-log content: if it's JSON (e.g. delegation list), convert
 * to readable markdown before passing to toSanitizedMarkdownHtml.
 */
export function formatExecutionLogContent(content: string): string {
  const raw = content.trim();
  if (raw.length < 2 || (!raw.startsWith("[") && !raw.startsWith("{"))) {
    return content;
  }
  try {
    const data = JSON.parse(raw) as unknown;
    const md = jsonToDelegationMarkdown(data) ?? jsonToStructuredMarkdown(data);
    if (md) {
      return md;
    }
  } catch {
    // Not valid JSON, keep original
  }
  return content;
}

export function toSanitizedMarkdownHtml(markdown: string): string {
  const input = markdown.trim();
  if (!input) {
    return "";
  }
  installHooks();
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    const cached = getCachedMarkdown(input);
    if (cached !== null) {
      return cached;
    }
  }
  const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
    : "";
  if (truncated.text.length > MARKDOWN_PARSE_LIMIT) {
    const escaped = escapeHtml(`${truncated.text}${suffix}`);
    const html = `<pre class="code-block">${escaped}</pre>`;
    const sanitized = DOMPurify.sanitize(html, sanitizeOptions);
    if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
      setCachedMarkdown(input, sanitized);
    }
    return sanitized;
  }
  let rendered: string;
  try {
    rendered = marked.parse(`${truncated.text}${suffix}`, {
      renderer: htmlEscapeRenderer,
      gfm: true,
      breaks: true,
    }) as string;
  } catch (err) {
    // Fall back to escaped plain text when marked.parse() throws (e.g.
    // infinite recursion on pathological markdown patterns — #36213).
    console.warn("[markdown] marked.parse failed, falling back to plain text:", err);
    const escaped = escapeHtml(`${truncated.text}${suffix}`);
    rendered = `<pre class="code-block">${escaped}</pre>`;
  }
  const sanitized = DOMPurify.sanitize(rendered, sanitizeOptions);
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    setCachedMarkdown(input, sanitized);
  }
  return sanitized;
}

// Prevent raw HTML in chat messages from being rendered as formatted HTML.
// Display it as escaped text so users see the literal markup.
// Security is handled by DOMPurify, but rendering pasted HTML (e.g. error
// pages) as formatted output is confusing UX (#13937).
const htmlEscapeRenderer = new marked.Renderer();
htmlEscapeRenderer.html = ({ text }: { text: string }) => escapeHtml(text);
htmlEscapeRenderer.image = (token: { href?: string | null; text?: string | null }) => {
  const label = normalizeMarkdownImageLabel(token.text);
  const href = token.href?.trim() ?? "";
  if (!INLINE_DATA_IMAGE_RE.test(href)) {
    return escapeHtml(label);
  }
  return `<img class="markdown-inline-image" src="${escapeHtml(href)}" alt="${escapeHtml(label)}">`;
};

function normalizeMarkdownImageLabel(text?: string | null): string {
  const trimmed = text?.trim();
  return trimmed ? trimmed : "image";
}

htmlEscapeRenderer.code = ({
  text,
  lang,
  escaped,
}: {
  text: string;
  lang?: string;
  escaped?: boolean;
}) => {
  const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  const safeText = escaped ? text : escapeHtml(text);
  const codeBlock = `<pre><code${langClass}>${safeText}</code></pre>`;
  const langLabel = lang ? `<span class="code-block-lang">${escapeHtml(lang)}</span>` : "";
  const attrSafe = text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const copyBtn = `<button type="button" class="code-block-copy" data-code="${attrSafe}" aria-label="Copy code"><span class="code-block-copy__idle">Copy</span><span class="code-block-copy__done">Copied!</span></button>`;
  const header = `<div class="code-block-header">${langLabel}${copyBtn}</div>`;

  const trimmed = text.trim();
  const isJson =
    lang === "json" ||
    (!lang &&
      ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))));

  if (isJson) {
    const lineCount = text.split("\n").length;
    const label = lineCount > 1 ? `JSON &middot; ${lineCount} lines` : "JSON";
    return `<details class="json-collapse"><summary>${label}</summary><div class="code-block-wrapper">${header}${codeBlock}</div></details>`;
  }

  return `<div class="code-block-wrapper">${header}${codeBlock}</div>`;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
