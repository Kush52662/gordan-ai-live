import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { RealtimeSession } from '../node_modules/@livekit/agents-plugin-google/dist/realtime/realtime_api.js';
import { realtimeOptions } from './realtime.ts';

const require = createRequire(import.meta.url);
const cjs =
  require('../node_modules/@livekit/agents-plugin-google/dist/realtime/realtime_api.cjs') as {
    RealtimeSession: typeof RealtimeSession;
  };
type FunctionResponse = { name: string; scheduling: string; willContinue?: boolean };
type Harness = {
  isNewGeneration: (response: object) => unknown;
  handleToolCall: (call: { functionCalls: { id: string; name: string; args: object }[] }) => void;
  getToolResultsForRealtime: (
    ctx: { items: object[] },
    vertexai: boolean,
  ) => { functionResponses: FunctionResponse[] };
};
for (const [format, Session] of [
  ['ESM', RealtimeSession],
  ['CJS', cjs.RealtimeSession],
] as const) {
  it(`${format}: progress stays silent; final scheduling distinguishes background success from useful results and errors`, () => {
    const send = vi.fn();
    const session = Object.assign(Object.create(Session.prototype), {
      options: { ...realtimeOptions, vertexai: false },
      currentGeneration: { functionChannel: { closed: false, write: vi.fn() } },
      pendingToolCallIds: new Set(),
      syntheticCallIds: new Set(),
      toolCallStatuses: new Map(),
      toolResponseCallIds: new WeakMap(),
      sendClientEvent: send,
      markCurrentGenerationDone: vi.fn(),
    }) as Harness;
    // Gemini sends these after toolCall. Treating them as new generations
    // synthesizes a speech interruption and drops the pending tool result.
    expect(session.isNewGeneration({ serverContent: { generationComplete: true } })).toBeFalsy();
    expect(session.isNewGeneration({ serverContent: { turnComplete: true } })).toBeFalsy();
    expect(
      session.isNewGeneration({
        serverContent: { inputTranscription: { text: 'Actually, wait' } },
      }),
    ).toBeTruthy();
    expect(
      session.isNewGeneration({ serverContent: { outputTranscription: { text: 'Ready' } } }),
    ).toBeTruthy();
    expect(session.isNewGeneration({ toolCall: { functionCalls: [] } })).toBeTruthy();
    for (const name of ['edit_recipe', 'update_cooking', 'load_skill']) {
      session.handleToolCall({ functionCalls: [{ id: name, name, args: {} }] });
      expect(send.mock.calls.at(-1)?.[0].value.functionResponses[0]).toMatchObject({
        willContinue: true,
        scheduling: 'SILENT',
      });
    }
    const responses = session.getToolResultsForRealtime(
      {
        items: [
          {
            type: 'function_call_output',
            callId: 'edit_recipe',
            name: 'edit_recipe',
            output: JSON.stringify({ ok: true, silent: true }),
          },
          {
            type: 'function_call_output',
            callId: 'update_cooking',
            name: 'update_cooking',
            output: JSON.stringify({ ok: true }),
          },
          {
            type: 'function_call_output',
            callId: 'load_skill',
            name: 'load_skill',
            output: JSON.stringify({ ok: false, error: 'Could not save' }),
          },
        ],
      },
      false,
    ).functionResponses;
    expect(responses.map((r) => r.scheduling)).toEqual(['SILENT', 'WHEN_IDLE', 'WHEN_IDLE']);
    expect(responses.every((r) => r.willContinue === false)).toBe(true);
  });
}
