// Tiny self-contained markdown renderer for headings, lists, code, bold/italic.
// We intentionally avoid pulling in a full markdown parser to keep the bundle
// small; the analyst reports stick to a predictable Markdown subset.

import { useMemo } from "react";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(input: string): string {
  // Triple backticks are handled at the block level. Inline code first.
  let out = input.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // Bold then italic.
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // Links.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener" class="underline">$1</a>');
  return out;
}

function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code fence.
    if (line.startsWith("```")) {
      closeList();
      const buffer: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buffer.push(escapeHtml(lines[i]));
        i++;
      }
      i++;
      out.push(`<pre><code>${buffer.join("\n")}</code></pre>`);
      continue;
    }

    // Heading.
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list.
    const ulItem = /^\s*[-*]\s+(.+)$/.exec(line);
    if (ulItem) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(escapeHtml(ulItem[1]))}</li>`);
      i++;
      continue;
    }
    // Ordered list.
    const olItem = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (olItem) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(escapeHtml(olItem[1]))}</li>`);
      i++;
      continue;
    }

    // Blank line ends paragraph/list.
    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }

    // Blockquote.
    if (line.startsWith("> ")) {
      closeList();
      out.push(`<blockquote>${inline(escapeHtml(line.slice(2)))}</blockquote>`);
      i++;
      continue;
    }

    // Paragraph: gather contiguous lines.
    closeList();
    const buffer: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buffer.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(escapeHtml(buffer.join(" ")))}</p>`);
  }

  closeList();
  return out.join("\n");
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source || ""), [source]);
  return (
    <div
      className={`markdown ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
