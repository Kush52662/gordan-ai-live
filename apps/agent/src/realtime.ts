import * as google from '@livekit/agents-plugin-google';

export function scheduleToolResponse(_name: string, output: unknown) {
  let result = output;
  if (typeof output === 'string') {
    try {
      result = JSON.parse(output);
    } catch {
      // Unreadable or failed results need the normal response path.
    }
  }
  const succeeded =
    typeof result === 'object' && result !== null && 'ok' in result && result.ok === true;
  return succeeded &&
    'silent' in (result as object) &&
    (result as { silent?: boolean }).silent === true
    ? google.beta.realtime.FunctionResponseScheduling.SILENT
    : google.beta.realtime.FunctionResponseScheduling.WHEN_IDLE;
}

export const realtimeOptions = {
  model: process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.8-live',
  voice: 'Puck',
  // Empty progress notifications are silent in the adapter; only useful results speak.
  toolBehavior: google.beta.realtime.Behavior.NON_BLOCKING,
  toolResponseScheduling: scheduleToolResponse,
  contextWindowCompression: {
    triggerTokens: '24000',
    slidingWindow: { targetTokens: '12000' },
  },
};
export function createRealtimeModel() {
  return new google.beta.realtime.RealtimeModel(realtimeOptions);
}
