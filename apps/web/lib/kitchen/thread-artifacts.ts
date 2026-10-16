import type { ThreadMessageLike } from '@assistant-ui/react';

export type ThreadArtifact = {
  id: string;
  after: string | null;
  part: Extract<ThreadMessageLike['content'], readonly unknown[]>[number];
};

// Attach UI to its original turn, never to the moving end of the transcript.
export function withArtifacts(messages: ThreadMessageLike[], artifacts: ThreadArtifact[]) {
  const result = messages.map((message) => ({ ...message }));
  let unanchored = 0;
  for (const artifact of artifacts) {
    // Retained conversation turns may already contain this artifact.
    if (
      messages.some(
        (message) =>
          Array.isArray(message.content) &&
          message.content.some(
            (part) =>
              part.type === 'tool-call' &&
              artifact.part.type === 'tool-call' &&
              part.toolCallId === artifact.part.toolCallId
          )
      )
    )
      continue;
    const anchor = result.findIndex((message) => message.id === artifact.after);
    const owner =
      anchor >= 0 && result[anchor].role === 'assistant'
        ? anchor
        : anchor >= 0
          ? result.findIndex((message, index) => index > anchor && message.role === 'assistant')
          : -1;
    if (artifact.after !== null && owner >= 0) {
      const message = result[owner];
      message.content = [
        ...(typeof message.content === 'string'
          ? [{ type: 'text' as const, text: message.content }]
          : message.content),
        artifact.part,
      ];
    } else {
      // Give standalone UI turns a stable place when retained messages are
      // sorted again after a disconnect.
      const timestamp =
        anchor >= 0
          ? (result[anchor].createdAt?.getTime() ?? Date.now()) + 1
          : (result[unanchored]?.createdAt?.getTime() ?? Date.now()) - 1;
      result.splice(anchor < 0 ? unanchored++ : anchor + 1, 0, {
        id: artifact.id,
        role: 'assistant',
        content: [artifact.part],
        createdAt: new Date(timestamp),
      });
    }
  }
  return result;
}
