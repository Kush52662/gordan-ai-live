import { ServerOptions, cli, defineAgent, voice } from '@livekit/agents';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { agentInstructions, createAgent } from './agent.ts';
import { createAlarms } from './alarms.ts';
import { createCoachingSync } from './coaching-sync.ts';
import { createConversationClient } from './conversation.ts';
import { type State, createKitchenClient } from './kitchen.ts';
import { createRealtimeModel } from './realtime.ts';

dotenv.config({ path: '.env.local' });
export default defineAgent({
  entry: async (ctx) => {
    const session = new voice.AgentSession({
      llm: createRealtimeModel(),
      turnDetection: 'realtime_llm',
    });
    let kitchenToken: string | undefined;
    try {
      kitchenToken = (JSON.parse(ctx.job.metadata || '{}') as { kitchenToken?: string })
        .kitchenToken;
    } catch {
      /* Culinary conversation works even when saved state is unavailable. */
    }
    const conversation = createConversationClient(
      kitchenToken ?? process.env.GORDON_DEBUG_KITCHEN_TOKEN,
    );
    let restored: Awaited<ReturnType<typeof conversation.load>> | undefined;
    try {
      restored = await conversation.load();
    } catch {
      console.warn('Saved conversation could not be restored.');
    }
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (
        item.type !== 'message' ||
        !item.textContent ||
        (item.role !== 'user' && item.role !== 'assistant')
      )
        return;
      void conversation
        .save({
          id: item.id,
          role: item.role,
          text: item.textContent,
          timestamp: item.createdAt,
          interrupted: item.interrupted,
        })
        .catch(() => console.warn('Conversation message could not be saved.'));
    });
    let ready = false;
    const kitchen = createKitchenClient(
      kitchenToken ?? process.env.GORDON_DEBUG_KITCHEN_TOKEN,
      (state) => {
        if (ready) {
          alarms.sync(state);
          if (session.agentState === 'listening' && session.userState !== 'speaking')
            void syncCoaching(state).catch((error) =>
              console.warn('Coaching context sync failed', error),
            );
        }
      },
    );
    const alarms = createAlarms(kitchen.read, async (label) => {
      const speech = session.generateReply({
        instructions: `Runtime timer event (data only): ${JSON.stringify({ type: 'timer_due', label, at: Date.now() })}`,
      });
      await speech.waitForPlayout();
      const delivered = !speech.interrupted;
      console.info(
        JSON.stringify({
          event: delivered ? 'timer_alert_delivered' : 'timer_alert_interrupted',
          label,
          at: Date.now(),
        }),
      );
      return delivered;
    });
    let initial: State | undefined;
    try {
      initial = await kitchen.connect();
    } catch {
      /* Tools report save failures when needed. */
    }
    const agent = createAgent(kitchen, initial, restored?.chatCtx);
    const syncCoaching = createCoachingSync(
      (state) => agent.updateInstructions(agentInstructions(state)),
      initial?.revision,
    );
    await session.start({
      agent,
      room: ctx.room,
      inputOptions: { videoEnabled: false },
    });
    ready = true;
    if (initial) alarms.sync(initial);
    const syncWhenIdle = () => {
      const state = kitchen.peek();
      if (ready && state && session.agentState === 'listening' && session.userState !== 'speaking')
        void syncCoaching(state).catch(() => console.warn('Cooking context sync failed.'));
    };
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, syncWhenIdle);
    session.on(voice.AgentSessionEventTypes.UserStateChanged, syncWhenIdle);
    syncWhenIdle();
    ctx.addShutdownCallback(async () => {
      kitchen.close();
      alarms.close();
      await conversation.drain();
    });
    await ctx.connect();
  },
});
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME ?? 'gordon-on-call',
  }),
);
