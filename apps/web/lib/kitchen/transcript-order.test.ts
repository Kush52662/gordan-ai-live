import { describe, expect, it } from 'vitest';
import { TranscriptTimeline } from './transcript-order';

const msg = (
  id: string,
  timestamp: number,
  message = id
): { id: string; timestamp: number; message: string; attributes?: Record<string, string> } => ({
  id,
  timestamp,
  message,
});
const stream = (
  id: string,
  timestamp: number,
  firstReceivedTime: number,
  attributes: Record<string, string> = {}
) => ({ streamInfo: { id, timestamp, attributes }, firstReceivedTime });
describe('Gemini transcript turn ordering', () => {
  it('places a late user transcript before the reply that answered it', () => {
    const timeline = new TranscriptTimeline();
    const reply = stream('reply', 2000, 12000);
    timeline.order([msg('reply', 2000)], [reply]);
    const user = stream('late-user', 5000, 15000, {
      'gordon.turn_started_at': '1000',
      'gordon.input_item_id': 'input-1',
    });
    const ordered = timeline.order([msg('reply', 2000), msg('late-user', 5000)], [reply, user]);
    expect(ordered.map((message) => message.id)).toEqual(['input-1', 'reply']);
    expect(ordered.map((message) => message.timestamp)).toEqual([11000, 12000]);
  });
  it('keeps an earlier greeting ahead of the user, and typed chat in its clock domain', () => {
    const streams = [
      stream('greeting', 1000, 11000),
      stream('user', 4000, 14000, { 'gordon.turn_started_at': '2000' }),
      stream('answer', 3000, 13000),
    ];
    const result = new TranscriptTimeline().order(
      [msg('greeting', 1000), msg('answer', 3000), msg('user', 4000), msg('typed-followup', 15000)],
      streams
    );
    expect(result.map((m) => m.id)).toEqual(['greeting', 'user', 'answer', 'typed-followup']);
  });

  it('does not force user-first ordering when the user interrupts an agent', () => {
    const result = new TranscriptTimeline().order(
      [msg('agent', 1000), msg('user', 5000)],
      [
        stream('agent', 1000, 11000),
        stream('user', 5000, 15000, { 'gordon.turn_started_at': '2000' }),
      ]
    );
    expect(result.map((m) => m.id)).toEqual(['agent', 'user']);
  });
});
