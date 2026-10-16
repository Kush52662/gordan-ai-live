import { describe, expect, it } from 'vitest';
import type { ThreadMessageLike } from '@assistant-ui/react';
import { type ThreadArtifact, withArtifacts } from './thread-artifacts';

const turn = (id: string, role: 'user' | 'assistant'): ThreadMessageLike => ({
  id,
  role,
  content: [{ type: 'text', text: id }],
});
const artifact = (after: string | null): ThreadArtifact => ({
  id: 'recipe-card',
  after,
  part: {
    type: 'tool-call',
    toolName: 'kitchen_recipe',
    toolCallId: 'recipe-card',
    args: { title: 'Rice' },
    argsText: '{}',
    result: { ready: true },
  },
});
describe('message-owned recipe UI', () => {
  it('does not duplicate artifacts retained across session disconnects', () => {
    const attached = withArtifacts([turn('reply', 'assistant')], [artifact('reply')]);
    expect(withArtifacts(attached, [artifact('reply')])).toEqual(attached);
    const standalone = withArtifacts([], [artifact(null)]);
    expect(withArtifacts(standalone, [artifact(null)])).toEqual(standalone);
  });
  it('stays in its original assistant turn when later conversation arrives', () => {
    const original = [turn('question', 'user'), turn('recipe-response', 'assistant')];
    const result = withArtifacts(
      [...original, turn('followup', 'user'), turn('answer', 'assistant')],
      [artifact('recipe-response')]
    );
    expect(result.map((m) => m.id)).toEqual(['question', 'recipe-response', 'followup', 'answer']);
    expect(result[1].content).toHaveLength(2);
    expect(result[3].content).toHaveLength(1);
    expect(original[1].content).toHaveLength(1);
  });
  it('binds a tool result to the reply following the initiating user turn', () => {
    const result = withArtifacts(
      [
        turn('question', 'user'),
        turn('reply', 'assistant'),
        turn('next', 'user'),
        turn('later', 'assistant'),
      ],
      [artifact('question')]
    );
    expect(result[1].content).toHaveLength(2);
    expect(result[3].content).toHaveLength(1);
  });
});
