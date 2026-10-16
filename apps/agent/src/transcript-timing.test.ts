import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { initializeLogger } from '../node_modules/@livekit/agents/dist/log.js';
import { ParticipantTranscriptionOutput } from '../node_modules/@livekit/agents/dist/voice/room_io/_output.js';

initializeLogger({ level: 'silent', pretty: false });
const require = createRequire(import.meta.url);
const cjs = require('../node_modules/@livekit/agents/dist/voice/room_io/_output.cjs') as {
  ParticipantTranscriptionOutput: typeof ParticipantTranscriptionOutput;
};
require('../node_modules/@livekit/agents/dist/log.cjs').initializeLogger({
  level: 'silent',
  pretty: false,
});

for (const [format, Output] of [
  ['ESM', ParticipantTranscriptionOutput],
  ['CJS', cjs.ParticipantTranscriptionOutput],
] as const) {
  it(`${format}: publishes original user-turn timing and stable input identity in real SDK streams`, async () => {
    const headers: Record<string, string>[] = [];
    const room = {
      on: vi.fn(),
      isConnected: true,
      localParticipant: {
        identity: 'agent',
        streamText: vi.fn(async (options: { attributes: Record<string, string> }) => {
          headers.push({ ...options.attributes });
          return { write: vi.fn(async () => {}), close: vi.fn(async () => {}) };
        }),
      },
    };
    const output = new Output(
      room as unknown as ConstructorParameters<typeof Output>[0],
      false,
      'cook',
    );
    output.setInputTiming(1000, 'input-1');
    await output.captureText('He');
    output.setInputTiming(1000, 'input-1');
    await output.captureText('Hey');
    output.flush();
    // Next capture waits for the prior final flush before changing its timing.
    output.setInputTiming(6000, 'input-2');
    await output.captureText('Next turn');
    const first = headers.filter((h) => h['gordon.input_item_id'] === 'input-1');
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.every((h) => h['gordon.turn_started_at'] === '1000')).toBe(true);
    expect(first.some((h) => h['lk.transcription_final'] === 'true')).toBe(true);
    expect(new Set(first.map((h) => h['lk.segment_id'])).size).toBe(1);
    expect(headers.at(-1)?.['gordon.turn_started_at']).toBe('6000');
    expect(headers.at(-1)?.['gordon.input_item_id']).toBe('input-2');
  });
}
