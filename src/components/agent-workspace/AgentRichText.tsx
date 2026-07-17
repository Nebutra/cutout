import { Fragment, type ReactNode } from "react";

type Block =
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "heading"; readonly level: 2 | 3 | 4; readonly text: string }
  | { readonly type: "quote"; readonly text: string }
  | { readonly type: "list"; readonly ordered: boolean; readonly items: readonly string[] }
  | { readonly type: "code"; readonly code: string };

/**
 * Small, deterministic Markdown subset for Agent-authored replies. Raw HTML,
 * images, embeds, and non-web links deliberately remain inert plain text.
 */
export function AgentRichText({ markdown }: { readonly markdown: string }) {
  return (
    <div className="space-y-2 break-words">
      {parseBlocks(markdown).map((block, index) => {
        if (block.type === "heading") {
          const Tag = block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
          return <Tag key={index} className="text-sm font-semibold leading-5">{renderInline(block.text)}</Tag>;
        }
        if (block.type === "quote") {
          return <blockquote key={index} className="border-l-2 border-border pl-2 text-muted-foreground">{renderInline(block.text)}</blockquote>;
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return <Tag key={index} className={block.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
            {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
          </Tag>;
        }
        if (block.type === "code") {
          return <pre key={index} className="overflow-x-auto rounded-md bg-background/70 p-2 text-xs leading-5"><code>{block.code}</code></pre>;
        }
        return <p key={index} className="whitespace-pre-wrap">{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

function parseBlocks(markdown: string): readonly Block[] {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    const text = paragraph.join("\n").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("```")) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", code: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: (heading[1].length + 1) as 2 | 3 | 4, text: heading[2] });
      continue;
    }
    if (line.startsWith("> ")) {
      flushParagraph();
      blocks.push({ type: "quote", text: line.slice(2) });
      continue;
    }
    const list = /^(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(line);
    if (list) {
      flushParagraph();
      const ordered = Boolean(list[2]);
      const items = [list[3]];
      while (index + 1 < lines.length) {
        const next = /^(?:([-*+])|(\d+)\.)\s+(.+)$/.exec(lines[index + 1] ?? "");
        if (!next || Boolean(next[2]) !== ordered) break;
        items.push(next[3]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]*\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-background/70 px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)]*)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      return href ? <a key={index} href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">{link[1]}</a> : <Fragment key={index}>{link[1]}</Fragment>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
