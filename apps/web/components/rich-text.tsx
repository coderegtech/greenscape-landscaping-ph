import type { RichTextNode } from '@greenscape/content';
import Link from 'next/link';
import type { ReactNode } from 'react';

// Renders CMS rich text (Tiptap/ProseMirror JSON) to React. Never raw HTML: unknown nodes render their text only,
// and links are limited to relative paths, http(s), mailto and tel.
const safeHref = (h: unknown) => (typeof h === 'string' && (/^\/(?!\/)/.test(h) || /^https?:\/\//.test(h) || /^(mailto|tel):/.test(h)) ? h : null);

function marks(node: RichTextNode, content: ReactNode, key: number): ReactNode {
  return (node.marks ?? []).reduce<ReactNode>((acc, m, i) => {
    if (m.type === 'bold') return <strong key={`${key}b${i}`}>{acc}</strong>;
    if (m.type === 'italic') return <em key={`${key}i${i}`}>{acc}</em>;
    if (m.type === 'link') {
      const href = safeHref(m.attrs?.href);
      if (!href) return acc;
      return href.startsWith('/') ? (
        <Link key={`${key}l${i}`} href={href}>
          {acc}
        </Link>
      ) : (
        <a key={`${key}l${i}`} href={href} rel="noopener">
          {acc}
        </a>
      );
    }
    return acc;
  }, content);
}

function render(nodes: RichTextNode[] | undefined, headingOffset: number): ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    const kids = () => render(n.content, headingOffset);
    switch (n.type) {
      case 'text':
        return marks(n, n.text ?? '', i);
      case 'hardBreak':
        return <br key={i} />;
      case 'paragraph':
        return <p key={i}>{kids()}</p>;
      case 'heading': {
        const level = Math.min(6, Math.max(2, Number(n.attrs?.level ?? 2) + headingOffset));
        const H = `h${level}` as 'h2';
        return <H key={i}>{kids()}</H>;
      }
      case 'bulletList':
        return <ul key={i}>{kids()}</ul>;
      case 'orderedList':
        return <ol key={i}>{kids()}</ol>;
      case 'listItem':
        return <li key={i}>{kids()}</li>;
      case 'blockquote':
        return <blockquote key={i}>{kids()}</blockquote>;
      default:
        return <span key={i}>{kids()}</span>;
    }
  });
}

/** `headingOffset` shifts heading levels when the body sits under a page h1 and a section h2. */
export function RichText({ doc, className, headingOffset = 0 }: { doc?: { content?: RichTextNode[] } | null; className?: string; headingOffset?: number }) {
  if (!doc?.content?.length) return null;
  return <div className={`prose-gs ${className ?? ''}`}>{render(doc.content, headingOffset)}</div>;
}
