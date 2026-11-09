'use client';
import { cn } from '@greenscape/ui/lib/utils';
import { EditorContent, type JSONContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Pilcrow, Quote, Redo2, Undo2 } from 'lucide-react';

type Doc = { type: 'doc'; content?: JSONContent[] };

/**
 * Structured rich text (stored as Tiptap JSON, rendered by apps/web/components/rich-text.tsx).
 * Only the nodes and marks the site renders are enabled: paragraphs, h2/h3, lists, quotes, bold, italic, links.
 */
export function RichTextEditor({ value, onChange, label, id, invalid }: { value: Doc | undefined; onChange: (v: Doc) => void; label: string; id: string; invalid?: boolean }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: { openOnClick: false, autolink: true, protocols: ['mailto', 'tel'], HTMLAttributes: { rel: 'noopener' } },
      }),
    ],
    content: value ?? { type: 'doc', content: [] },
    editorProps: { attributes: { id, role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'prose-gs max-w-none min-h-40 px-3 py-2 outline-none' } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as Doc),
  });
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      h2: e?.isActive('heading', { level: 2 }) ?? false,
      h3: e?.isActive('heading', { level: 3 }) ?? false,
      ul: e?.isActive('bulletList') ?? false,
      ol: e?.isActive('orderedList') ?? false,
      quote: e?.isActive('blockquote') ?? false,
      link: e?.isActive('link') ?? false,
    }),
  });
  if (!editor) return <div className="min-h-40 border border-rule-strong bg-paper-3" aria-busy />;
  const btn = (active: boolean, label: string, onClick: () => void, Icon: typeof Bold) => (
    <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={cn('grid size-8 place-items-center text-ink-2 hover:bg-paper-2 hover:text-ink', active && 'bg-paper-2 text-ink')}>
      <Icon className="size-4" aria-hidden />
    </button>
  );
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Link address (e.g. /quote or https://…). Leave empty to remove.', prev ?? '');
    if (href === null) return;
    if (!href) return editor.chain().focus().unsetLink().run();
    if (!/^(\/(?!\/)|https?:\/\/|mailto:|tel:)/.test(href)) return window.alert('Links must start with /, https://, mailto: or tel:');
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };
  return (
    <div className={cn('border bg-paper-3', invalid ? 'border-danger' : 'border-rule-strong')}>
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-0.5 border-b border-rule p-1">
        {btn(!s?.h2 && !s?.h3, 'Paragraph', () => editor.chain().focus().setParagraph().run(), Pilcrow)}
        {btn(!!s?.h2, 'Heading', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
        {btn(!!s?.h3, 'Subheading', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
        {btn(!!s?.bold, 'Bold', () => editor.chain().focus().toggleBold().run(), Bold)}
        {btn(!!s?.italic, 'Italic', () => editor.chain().focus().toggleItalic().run(), Italic)}
        {btn(!!s?.ul, 'Bulleted list', () => editor.chain().focus().toggleBulletList().run(), List)}
        {btn(!!s?.ol, 'Numbered list', () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
        {btn(!!s?.quote, 'Quote', () => editor.chain().focus().toggleBlockquote().run(), Quote)}
        {btn(!!s?.link, 'Link', setLink, Link2)}
        <span className="mx-1 w-px bg-rule" aria-hidden />
        {btn(false, 'Undo', () => editor.chain().focus().undo().run(), Undo2)}
        {btn(false, 'Redo', () => editor.chain().focus().redo().run(), Redo2)}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
