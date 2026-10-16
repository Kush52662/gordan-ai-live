'use client';

import { Bold, Italic, List, Undo2 } from 'lucide-react';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';

// Markdown stays in the existing instruction string: no second recipe representation.
export function RichInstruction({
  value,
  onChange,
  disabled = false,
  label = 'Recipe instruction',
}: {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const editable = !!onChange && !disabled;
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          link: false,
          underline: false,
          heading: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Markdown,
      ],
      content: value,
      contentType: 'markdown',
      editable,
      editorProps: {
        attributes: {
          'aria-label': label,
          ...(editable ? { role: 'textbox', 'aria-multiline': 'true' } : {}),
        },
      },
      onUpdate: ({ editor }) => onChange?.(editor.getMarkdown()),
    },
    [editable]
  );
  return (
    <div className={`k-rich-instruction ${editable ? 'is-editable' : ''}`}>
      {editable && (
        <div className="k-format-toolbar" role="group" aria-label={`Format ${label}`}>
          <button
            type="button"
            aria-label="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            aria-label="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            aria-label="Bullet list"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List size={14} />
          </button>
          <button
            type="button"
            aria-label="Undo"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 size={14} />
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
