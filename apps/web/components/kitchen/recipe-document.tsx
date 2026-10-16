'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { type RecipeInput, recipeInput } from '@/lib/kitchen/model';
import { recipeFromDocument, recipeMarkdown } from '@/lib/kitchen/recipe-markdown';
import type { KitchenController } from './use-kitchen';

const blank =
  '# Your recipe\n\nServings: 2\n\n## Ingredients\n\n- Ingredient: amount unit\n\n## Prep\n\n1. Prepare ingredients.\n\n## Cook\n\n1. Cook the dish.\n\n## Plate\n\n1. Serve.';
export function RecipeDocument({
  recipe,
  recipeId,
  controller,
  onSaved,
}: {
  recipe?: RecipeInput;
  recipeId?: string;
  controller: KitchenController;
  onSaved: (id: string) => void;
}) {
  const base = useRef(recipe ? JSON.stringify(recipeInput.parse(recipe)) : '');
  const draft = useRef(false),
    saving = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ recipe, recipeId, controller, onSaved });
  latest.current = { recipe, recipeId, controller, onSaved };
  const [status, setStatus] = useState('Click anywhere to edit · Markdown shortcuts supported');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: false, underline: false }), Markdown],
    content: recipe ? recipeMarkdown(recipe) : blank,
    contentType: 'markdown',
    editorProps: {
      attributes: { 'aria-label': 'Recipe document', role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor }) => {
      const manager = editor.storage.markdown.manager;
      const original = base.current
        ? manager.serialize(manager.parse(recipeMarkdown(JSON.parse(base.current))))
        : '';
      draft.current = editor.getMarkdown().trim() !== original.trim();
      setStatus(draft.current ? 'Editing…' : 'Saved');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), 1200);
    },
    onBlur: () => {
      clearTimeout(timer.current);
      void save().then(sync);
    },
  });
  async function save() {
    if (!editor || !draft.current || saving.current) return;
    const { recipe, recipeId, controller, onSaved } = latest.current;
    if (controller.busy) {
      timer.current = setTimeout(() => void save(), 500);
      return;
    }
    saving.current = true;
    setStatus('Saving…');
    const written = editor.getMarkdown();
    let success = false;
    try {
      const manager = editor.storage.markdown.manager;
      const next = recipeFromDocument(
        editor.getJSON(),
        (node) => manager.serialize(node),
        recipe,
        (value) => manager.serialize(manager.parse(value)).trim()
      );
      const result = await controller.act(
        recipeId
          ? { type: 'edit_document', recipeId, base: base.current, recipe: next }
          : { type: 'save_recipe', recipe: next }
      );
      base.current = JSON.stringify(next);
      success = true;
      draft.current = editor.getMarkdown() !== written;
      setStatus(draft.current ? 'Editing…' : 'Saved');
      if (!recipeId || recipeId.startsWith('choice:')) onSaved(result.recipes[0].id);
    } catch (error) {
      setStatus(`Draft not saved: ${error instanceof Error ? error.message : 'Please retry.'}`);
    } finally {
      saving.current = false;
      if (success && draft.current) timer.current = setTimeout(() => void save(), 500);
    }
  }
  const sync = useCallback(() => {
    const current = latest.current.recipe;
    if (!editor || !current || draft.current || saving.current) return;
    const incoming = JSON.stringify(recipeInput.parse(current));
    if (incoming === base.current) return;
    editor.commands.setContent(recipeMarkdown(current), {
      contentType: 'markdown',
      emitUpdate: false,
    });
    base.current = incoming;
    setStatus('Updated by Gordon');
  }, [editor]);
  useEffect(() => {
    if (!editor || !recipe) return;
    const incoming = JSON.stringify(recipeInput.parse(recipe));
    if (incoming === base.current) return;
    if (draft.current) {
      setStatus(
        'Gordon updated the recipe. Your draft is retained. Undo your draft to review the newer version.'
      );
      return;
    }
    if (!editor.isFocused) sync();
  }, [editor, recipe, sync]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="k-markdown-document">
      <p className="k-document-save-state" role="status">
        {status}
      </p>
      <EditorContent editor={editor} />
    </div>
  );
}
