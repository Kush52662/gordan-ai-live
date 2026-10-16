'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConnectionState } from 'livekit-client';
import {
  ArrowUp,
  AudioLines,
  ChefHat,
  FileText,
  LoaderCircle,
  Mic,
  MicOff,
  PanelRightOpen,
  PhoneOff,
  Timer,
} from 'lucide-react';
import {
  type AppendMessage,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  type ThreadMessageLike,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import {
  BarVisualizer,
  useAgent,
  useLocalParticipant,
  useSessionContext,
  useSessionMessages,
  useTranscriptions,
} from '@livekit/components-react';
import { OptionList } from '@/components/assistant-ui/elements/option-list';
import { mergeMessages } from '@/lib/kitchen/conversation';
import {
  type Discovery,
  type IngredientPlan,
  type RecipeInput,
  ingredientsAccepted,
} from '@/lib/kitchen/model';
import { type ThreadArtifact, withArtifacts } from '@/lib/kitchen/thread-artifacts';
import { TranscriptTimeline } from '@/lib/kitchen/transcript-order';
import { IngredientChecklist } from './ingredient-checklist';
import { KitchenStarter } from './kitchen-starter';
import { type Editor, RecipePanel } from './recipe-panel';
import { useConversation } from './use-conversation';
import { type KitchenController, useKitchen } from './use-kitchen';

type RecipeContextValue = {
  controller: KitchenController;
  decide: (text: string) => Promise<void>;
  openRecipe: (target: string, choices?: RecipeInput[]) => void;
};
const RecipeContext = createContext<RecipeContextValue | null>(null);

type RecipeCardArgs = { target: string; recipe: RecipeInput; completed?: number };
const RecipePreview: ToolCallMessagePartComponent<RecipeCardArgs, unknown> = ({ args }) => {
  const context = useContext(RecipeContext);
  if (!context) return null;
  const { recipe, target, completed } = args;
  const isMeal = target === 'meal';
  return (
    <div className="k-rich-recipe">
      <button className="k-artifact" onClick={() => context.openRecipe(target)}>
        <span className="k-artifact-icon">
          <FileText size={19} aria-hidden />
        </span>
        <span>
          <strong>{recipe.title}</strong>
          <small>
            {recipe.servings} servings ·{' '}
            {isMeal
              ? `${completed ?? 0} of ${recipe.steps.length} steps done`
              : recipe.steps.length
                ? 'Autosaved recipe'
                : 'Ingredient draft · Autosaved'}
          </small>
        </span>
        <PanelRightOpen size={16} aria-hidden />
      </button>
      {target && <RecipeDecisions target={target} recipe={recipe} />}
    </div>
  );
};
function RecipeDecisions({ target, recipe }: { target: string; recipe: RecipeInput }) {
  const context = useContext(RecipeContext);
  if (!context?.controller.kitchen) return null;
  const kitchen = context.controller.kitchen;
  const checkId = target === 'meal' ? 'active-meal' : target;
  const current =
    target === 'meal'
      ? kitchen.meal?.recipe
      : target.startsWith('choice:')
        ? kitchen.choices?.[Number(target.split(':')[1])]
        : kitchen.recipes.find((item) => item.id === target);
  if (!current) return null;
  recipe = current;
  const accepted = ingredientsAccepted(kitchen, checkId, recipe);
  return (
    <div className="k-recipe-chat-decisions">
      {!accepted && (
        <IngredientChecklist
          recipe={recipe}
          recipeId={checkId}
          controller={context.controller}
          onDecision={context.decide}
        />
      )}
      <ThreadPrimitive.Suggestion
        className="k-suggestion"
        send
        prompt={`I'd like to discuss adjustments to ${recipe.title}. Ask what I'd like to change.`}
      >
        Discuss a change
      </ThreadPrimitive.Suggestion>
      {accepted && recipe.steps.length > 0 && target !== 'meal' && (
        <ThreadPrimitive.Suggestion
          className="k-suggestion"
          send
          prompt={`I'm ready to start preparation for the displayed ${recipe.title} recipe. Use ${target}.`}
        >
          Start preparation
        </ThreadPrimitive.Suggestion>
      )}
    </div>
  );
}
const ChoicesPreview: ToolCallMessagePartComponent<{ recipes: RecipeInput[] }, unknown> = ({
  args,
}) => {
  const context = useContext(RecipeContext);
  if (!context) return null;
  return (
    <div className="k-recipe-choices">
      {args.recipes.map((recipe, index) => (
        <div key={index}>
          <button
            className="k-artifact"
            onClick={() => context.openRecipe(`choice:${index}`, args.recipes)}
          >
            <FileText size={20} />
            <span>
              <strong>{recipe.title}</strong>
              <small>Open editable recipe</small>
            </span>
            <PanelRightOpen size={16} />
          </button>
          <RecipeDecisions target={`choice:${index}`} recipe={recipe} />
        </div>
      ))}
    </div>
  );
};

const DishOptions: ToolCallMessagePartComponent<{ discovery: Discovery }, unknown> = ({ args }) => {
  const context = useContext(RecipeContext);
  if (!context) return null;
  const current = context.controller.kitchen?.discovery;
  const active = current?.id === args.discovery.id;
  const discovery = active ? current : args.discovery;
  return (
    <div className="k-dish-options">
      <p>{discovery.question}</p>
      <OptionList
        className="k-chat-options"
        aria-label={discovery.question}
        options={discovery.options.map((o) => ({
          id: o.id,
          label: o.title,
          description: o.description,
          disabled: context.controller.busy || !active,
        }))}
        choice={discovery.selectedId ? [discovery.selectedId] : undefined}
        onConfirm={
          active
            ? async (ids) => {
                const chosen = discovery.options.find((o) => o.id === ids[0])!;
                await context.controller.act({
                  type: 'select_dish',
                  discoveryId: discovery.id,
                  optionId: chosen.id,
                });
                await context.decide(
                  `I'm interested in ${chosen.title}. Let's discuss that option.`
                );
              }
            : undefined
        }
      />
      <ThreadPrimitive.Suggestion
        className="k-suggestion"
        send
        prompt="None of those quite fit. Let's talk about some different options."
      >
        Something else
      </ThreadPrimitive.Suggestion>
    </div>
  );
};
const PlansPreview: ToolCallMessagePartComponent<{ plans: IngredientPlan[] }, unknown> = ({
  args,
}) => {
  const context = useContext(RecipeContext);
  if (!context) return null;
  return (
    <div className="k-recipe-choices">
      {args.plans.map((plan, index) => (
        <IngredientChecklist
          key={index}
          recipe={plan}
          recipeId={`plan:${index}`}
          controller={context.controller}
          onDecision={context.decide}
        />
      ))}
    </div>
  );
};

function UserMessage() {
  return (
    <MessagePrimitive.Root className="k-user-message">
      <MessagePrimitive.Content />
    </MessagePrimitive.Root>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="k-assistant-message">
      <div className="k-speaker">
        <ChefHat size={16} aria-hidden /> Gordon AI
      </div>
      <MessagePrimitive.Parts
        components={{
          tools: {
            by_name: {
              kitchen_recipe: RecipePreview,
              kitchen_dishes: DishOptions,
              kitchen_choices: ChoicesPreview,
              kitchen_ingredients: PlansPreview,
            },
          },
        }}
      />
    </MessagePrimitive.Root>
  );
}
const MESSAGE_COMPONENTS = { UserMessage, AssistantMessage };
const convertMessage = (message: ThreadMessageLike) => message;

export function KitchenWorkspace() {
  const controller = useKitchen();
  const conversation = useConversation();
  const {
    ready: historyReady,
    observe: observeConversation,
    flush: flushConversation,
  } = conversation;
  const { kitchen, error, setError, busy, now, act } = controller;
  const session = useSessionContext();
  const agent = useAgent();
  const { messages: receivedMessages, send, isSending } = useSessionMessages(session);
  const transcriptions = useTranscriptions({ room: session.room });
  const timeline = useRef(new TranscriptTimeline());
  const messages = useMemo(
    () => timeline.current.order(receivedMessages, transcriptions),
    [receivedMessages, transcriptions]
  );
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelView, setPanelView] = useState('recipe');
  const [target, setTarget] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [connecting, setConnecting] = useState(false);
  const [changingMic, setChangingMic] = useState(false);
  const pendingReadyCue = useRef(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [focusedRecipe, setFocusedRecipe] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ThreadArtifact[]>([]);
  const [previewChoices, setPreviewChoices] = useState<RecipeInput[] | undefined>();
  const observed = useRef<{
    choices: string;
    plans: string;
    checks: string;
    discovery: string;
    recipes: Map<string, number>;
    documentId?: string;
    mealId: string | null;
    mealStage: string | null;
  } | null>(null);
  const connection = useRef<Promise<void> | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (pendingReadyCue.current && session.isConnected && agent.isConnected) {
      pendingReadyCue.current = false;
      void controller.playCallCue('ready');
    }
  }, [session.isConnected, agent.isConnected, controller]);
  const meal = kitchen?.meal;
  const due = [...(kitchen?.timers ?? []), ...(meal?.timers ?? [])].filter(
    (t) => t.status === 'running' && t.deadline <= now
  );

  const savedMessages = useRef(conversation.messages);
  savedMessages.current = conversation.messages;
  const latestMessages = useRef(messages);
  latestMessages.current = messages;
  const recordArtifact = useCallback(
    (
      id: string,
      toolName: string,
      args:
        | RecipeCardArgs
        | { recipes: RecipeInput[] }
        | { plans: IngredientPlan[] }
        | { discovery: Discovery }
    ) => {
      const last = latestMessages.current.at(-1);
      const after = last
        ? (last.attributes?.['lk.segment_id'] ?? last.id)
        : (savedMessages.current.at(-1)?.id ?? null);
      const part = {
        type: 'tool-call' as const,
        toolName,
        toolCallId: id,
        args,
        argsText: JSON.stringify(args),
        result: { ready: true },
      };
      setArtifacts((previous) => {
        const existing = previous.find((artifact) => artifact.id === id);
        return existing
          ? previous.map((artifact) => (artifact.id === id ? { ...artifact, part } : artifact))
          : [...previous, { id, after, part }];
      });
    },
    []
  );
  // Persisted kitchen data is available for explicit resume/library access, not a new chat turn.
  useEffect(() => {
    if (!kitchen) return;
    const snapshot = {
      choices: JSON.stringify(kitchen.choices ?? []),
      plans: JSON.stringify(kitchen.plans ?? []),
      checks: JSON.stringify(kitchen.ingredientChecks ?? {}),
      discovery: JSON.stringify(kitchen.discovery ?? null),
      recipes: new Map(kitchen.recipes.map((r) => [r.id, r.version])),
      documentId: kitchen.documentId,
      mealId: kitchen.meal?.id ?? null,
      mealStage: kitchen.meal?.stage ?? null,
    };
    const before = observed.current;
    observed.current = snapshot;
    if (!conversationStarted || !before) return;
    if (
      snapshot.mealId &&
      (snapshot.mealId !== before.mealId || snapshot.mealStage !== before.mealStage)
    ) {
      setFocusedRecipe('meal');
      setTarget('meal');
      setPanelView('dashboard');
      setDrawerOpen(true);
      recordArtifact(`meal-${kitchen.meal!.id}`, 'kitchen_recipe', {
        target: 'meal',
        recipe: kitchen.meal!.recipe,
        completed: kitchen.meal!.completed.length,
      });
    } else if (snapshot.discovery !== before.discovery && kitchen.discovery) {
      recordArtifact(`dishes-${kitchen.discovery.id}`, 'kitchen_dishes', {
        discovery: kitchen.discovery,
      });
    } else if (snapshot.plans !== before.plans && kitchen.plans?.length) {
      recordArtifact(`ingredients-${kitchen.revision}`, 'kitchen_ingredients', {
        plans: kitchen.plans,
      });
    } else if (snapshot.choices !== before.choices && kitchen.choices?.length) {
      setFocusedRecipe(null);
      setPreviewChoices(undefined);
      setTarget('choice:0');
      setPanelView('recipe');
      setDrawerOpen(true);
      recordArtifact(`choices-${kitchen.revision}`, 'kitchen_choices', {
        recipes: kitchen.choices,
      });
    } else {
      const changed =
        kitchen.recipes.find((r) => before.recipes.get(r.id) !== r.version) ??
        (snapshot.documentId !== before.documentId
          ? kitchen.recipes.find((r) => r.id === snapshot.documentId)
          : undefined);
      if (changed && !(focusedRecipe === 'meal' && changed.id === kitchen.meal?.recipeId)) {
        setFocusedRecipe(changed.id);
        setTarget(changed.id);
        setPreviewChoices(undefined);
        setDrawerOpen(true);
        recordArtifact(`recipe-${changed.id}`, 'kitchen_recipe', {
          target: changed.id,
          recipe: changed,
        });
      }
    }
  }, [kitchen, conversationStarted, focusedRecipe, recordArtifact]);

  const resumedFromLibrary = useRef(false);
  useEffect(() => {
    if (!kitchen?.meal || resumedFromLibrary.current) return;
    if (new URLSearchParams(window.location.search).get('resume') !== 'meal') return;
    resumedFromLibrary.current = true;
    setConversationStarted(true);
    setFocusedRecipe('meal');
    setTarget('meal');
    setPanelView('dashboard');
    setDrawerOpen(true);
  }, [kitchen?.meal]);

  function resumeMeal() {
    setConversationStarted(true);
    setFocusedRecipe('meal');
    setTarget('meal');
    setPanelView('dashboard');
    setDrawerOpen(true);
  }

  function openRecipe(id: string, choices?: RecipeInput[]) {
    setPanelView('recipe');
    setPreviewChoices(choices);
    setConversationStarted(true);
    if (!id.startsWith('choice:')) {
      setFocusedRecipe(id);
    }
    setTarget(id);
    setEditor(null);
    setDrawerOpen(true);
  }
  async function connect(voice: boolean) {
    if (!conversation.ready) throw new Error('Restore your saved chat before connecting.');
    if (connection.current) await connection.current;
    if (
      session.room.state === ConnectionState.Reconnecting ||
      session.room.state === ConnectionState.SignalReconnecting ||
      session.room.state === ConnectionState.Connecting
    ) {
      await session.waitUntilConnected(AbortSignal.timeout(20000));
    }
    if (session.room.state !== ConnectionState.Connected) {
      setConnecting(true);
      connection.current = session.start({
        tracks: {
          microphone: { enabled: voice },
          camera: { enabled: false },
          screenShare: { enabled: false },
        },
      });
      try {
        await connection.current;
      } catch (e) {
        await session.end().catch(() => {});
        throw e;
      } finally {
        connection.current = null;
        setConnecting(false);
      }
    } else if (voice && !localParticipant.isMicrophoneEnabled) {
      await localParticipant.setMicrophoneEnabled(true);
    }
  }
  async function onNew(message: AppendMessage) {
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();
    await sendDecision(text);
  }
  async function sendDecision(text: string) {
    if (!text) return;
    setConversationStarted(true);
    setError('');
    try {
      await connect(false);
      await send(text);
    } catch (e) {
      const problem = e instanceof Error ? e.message : 'Could not send your message. Try again.';
      setError(problem);
      throw e;
    }
  }
  const threadMessages = useMemo<ThreadMessageLike[]>(() => {
    const transcript: ThreadMessageLike[] = messages.map((message) => ({
      // Interim/final streams share this LiveKit segment ID, but not a stream ID.
      id: message.attributes?.['lk.segment_id'] ?? message.id,
      role: message.from?.isLocal ? 'user' : 'assistant',
      content: [{ type: 'text', text: message.message }],
      createdAt: new Date(message.timestamp),
    }));
    return withArtifacts(mergeMessages(conversation.messages, transcript), artifacts);
  }, [messages, artifacts, conversation.messages]);
  useEffect(() => {
    if (!historyReady) return;
    observeConversation(threadMessages);
    const timer = setTimeout(flushConversation, 400);
    return () => clearTimeout(timer);
  }, [threadMessages, historyReady, observeConversation, flushConversation]);
  // assistant-ui renders LiveKit's existing conversation; it never creates another model transport.
  const runtime = useExternalStoreRuntime({
    messages: threadMessages,
    convertMessage,
    isRunning: isSending,
    onNew,
  });
  async function startVoice() {
    if (connecting) return;
    setError('');
    setConversationStarted(true);
    try {
      pendingReadyCue.current = true;
      await controller.playCallCue('calling');
      await connect(true);
      const draft = runtime.thread.composer.getState().text.trim();
      if (draft) {
        await send(draft);
        runtime.thread.composer.setText('');
      } else if (focusedRecipe === 'meal') {
        await send('Resume my saved active meal. Check its current step before guiding me.');
      }
    } catch {
      pendingReadyCue.current = false;
      void controller.playCallCue('failed');
      setError(
        'Voice could not start. Check microphone access and try again, or send a typed message. Your recipe controls remain available.'
      );
    }
  }
  async function toggleMicrophone() {
    setChangingMic(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setError('Could not change microphone access. Check browser permissions.');
    } finally {
      setChangingMic(false);
    }
  }
  async function startIntent(text: string) {
    setConversationStarted(true);
    setError('');
    try {
      await connect(false);
      await send(text);
    } catch {
      runtime.thread.composer.setText(text);
      setError('Could not start the conversation. Send your message again, or try voice.');
      input.current?.focus();
    }
  }
  const welcome = threadMessages.length === 0 && !conversationStarted;
  const voiceState =
    session.connectionState === ConnectionState.Reconnecting ||
    session.connectionState === ConnectionState.SignalReconnecting
      ? 'Reconnecting…'
      : connecting
        ? 'Connecting…'
        : !session.isConnected
          ? 'Voice off'
          : !isMicrophoneEnabled
            ? 'Microphone off'
            : agent.state === 'speaking'
              ? 'Gordon AI is speaking'
              : agent.state === 'thinking'
                ? 'Thinking…'
                : agent.state === 'listening'
                  ? 'Gordon AI is ready · listening'
                  : 'Gordon AI is joining…';

  return (
    <RecipeContext.Provider value={{ controller, openRecipe, decide: sendDecision }}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="k-app">
          <main className="k-main">
            <header className="k-header">
              <p>
                Gordon <span>AI</span>
              </p>
              <div className="k-header-actions">
                <span className="k-chat-save-status" role="status">
                  {conversation.error ? (
                    <button className="k-text-button" onClick={() => void conversation.retry()}>
                      {conversation.error} Retry
                    </button>
                  ) : !conversation.ready ? (
                    'Restoring chat…'
                  ) : conversation.saving ? (
                    'Saving chat…'
                  ) : (
                    'Chat saved'
                  )}
                </span>
                {(target || editor) && (
                  <button
                    className="k-details-trigger"
                    aria-expanded={drawerOpen}
                    onClick={() => setDrawerOpen((value) => !value)}
                  >
                    <PanelRightOpen size={15} />{' '}
                    {drawerOpen ? 'Hide workspace' : 'Recipe & dashboard'}
                    {due.length > 0 && (
                      <span className="k-alert-dot" aria-label="Timer needs attention" />
                    )}
                  </button>
                )}
              </div>
            </header>
            {error && !drawerOpen && (
              <div className="k-error" role="alert">
                <span>{error}</span>
                <button disabled={busy} onClick={() => void controller.retrySave()}>
                  Retry
                </button>
              </div>
            )}
            <div className={`k-workspace ${drawerOpen ? 'has-panel' : ''}`}>
              <div className="k-conversation-pane">
                <section className="k-chat-page" aria-label="Conversation with Gordon AI">
                  <ThreadPrimitive.Root className={`k-thread ${welcome ? 'is-welcome' : ''}`}>
                    <ThreadPrimitive.Viewport className="k-thread-viewport">
                      {welcome ? (
                        <KitchenStarter
                          disabled={connecting || isSending || !kitchen}
                          connecting={connecting}
                          onIngredients={() =>
                            void startIntent(
                              'Help me decide what to cook from my ingredients. Ask me what I have.'
                            )
                          }
                          onCraving={() =>
                            void startIntent(
                              'Help me cook a dish I’m craving. Ask me what I feel like eating.'
                            )
                          }
                          onVoice={() => void startVoice()}
                        />
                      ) : threadMessages.length === 0 ? (
                        <p className="k-discovery-pending" role="status">
                          {connecting
                            ? 'Connecting to Gordon…'
                            : 'Tell Gordon what you have in mind.'}
                        </p>
                      ) : (
                        <div className="k-message-list">
                          {conversation.hasMore && (
                            <button
                              className="k-suggestion"
                              disabled={conversation.loadingOlder}
                              onClick={() => void conversation.loadOlder()}
                            >
                              {conversation.loadingOlder ? 'Loading…' : 'Load earlier messages'}
                            </button>
                          )}
                          <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
                        </div>
                      )}
                      <ThreadPrimitive.ViewportFooter className="k-thread-footer">
                        <div className="k-composer-zone">
                          {due.length > 0 && (
                            <div role="alert" className="k-timer-alert">
                              <span>
                                <Timer size={15} /> Time to check
                              </span>
                              {due.map((timer) => (
                                <button
                                  key={timer.id}
                                  disabled={busy}
                                  onClick={() =>
                                    void act({
                                      type: 'acknowledge_timer',
                                      timerId: timer.id,
                                    }).catch(() => {})
                                  }
                                >
                                  Acknowledge {timer.label}
                                </button>
                              ))}
                            </div>
                          )}
                          <ComposerPrimitive.Root
                            className="k-composer"
                            data-call-state={
                              session.isConnected
                                ? agent.state
                                : connecting
                                  ? 'connecting'
                                  : 'disconnected'
                            }
                          >
                            <ComposerPrimitive.Input
                              ref={input}
                              aria-label="Message Gordon AI"
                              placeholder={
                                session.isConnected
                                  ? 'Say it aloud, or type here…'
                                  : 'Tell Gordon AI what’s in your kitchen…'
                              }
                              rows={1}
                              autoFocus={false}
                            />
                            <div className="k-composer-controls">
                              <div
                                className={
                                  session.isConnected ? 'k-voice-state' : 'k-composer-hint'
                                }
                                role="status"
                              >
                                {session.isConnected ? (
                                  <>
                                    <BarVisualizer
                                      className="k-call-visualizer"
                                      state={agent.state}
                                      track={agent.microphoneTrack}
                                      barCount={5}
                                      options={{ minHeight: 12, maxHeight: 100 }}
                                      aria-hidden="true"
                                    />
                                    {voiceState}
                                  </>
                                ) : (
                                  <>
                                    {connecting ? (
                                      <LoaderCircle size={14} className="animate-spin" />
                                    ) : (
                                      <AudioLines size={14} />
                                    )}
                                    {connecting
                                      ? 'Calling Gordon AI…'
                                      : conversation.messages.length
                                        ? 'Voice off · Chat kept'
                                        : 'Voice-first cooking'}
                                  </>
                                )}
                              </div>
                              <div className="k-voice-tools">
                                <ComposerPrimitive.Send
                                  className="k-send"
                                  aria-label="Send message"
                                  disabled={connecting || !kitchen || !conversation.ready}
                                >
                                  <ArrowUp size={17} />
                                </ComposerPrimitive.Send>
                                {session.isConnected ? (
                                  <>
                                    <button
                                      type="button"
                                      className="k-icon-button"
                                      aria-label={
                                        isMicrophoneEnabled
                                          ? 'Mute microphone'
                                          : 'Enable microphone'
                                      }
                                      aria-pressed={!isMicrophoneEnabled}
                                      disabled={changingMic}
                                      onClick={() => void toggleMicrophone()}
                                    >
                                      {isMicrophoneEnabled ? (
                                        <Mic size={17} />
                                      ) : (
                                        <MicOff size={17} />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      className="k-icon-button k-hangup"
                                      aria-label="End conversation"
                                      onClick={() => {
                                        observeConversation(threadMessages);
                                        flushConversation();
                                        void session
                                          .end()
                                          .catch(() =>
                                            setError('Could not disconnect. Please retry.')
                                          );
                                      }}
                                    >
                                      <PhoneOff size={17} />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="k-voice-button"
                                    disabled={connecting || !kitchen || !conversation.ready}
                                    onClick={() => void startVoice()}
                                  >
                                    <AudioLines size={17} />{' '}
                                    {connecting
                                      ? 'Connecting…'
                                      : conversation.messages.length
                                        ? 'Resume Gordon AI'
                                        : 'Talk to Gordon AI'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </ComposerPrimitive.Root>

                          <p className="k-composer-caption">
                            {!kitchen
                              ? 'Opening your kitchen…'
                              : session.isConnected
                                ? 'One conversation, from idea to plate.'
                                : ''}
                          </p>
                        </div>
                      </ThreadPrimitive.ViewportFooter>
                    </ThreadPrimitive.Viewport>
                  </ThreadPrimitive.Root>
                </section>
              </div>
              <RecipePanel
                view={panelView}
                onViewChange={setPanelView}
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                target={target}
                previewChoices={previewChoices}
                onSelect={(id) =>
                  openRecipe(id, id.startsWith('choice:') ? previewChoices : undefined)
                }
                onMealStarted={resumeMeal}
                editor={editor}
                setEditor={setEditor}
                controller={controller}
              />
            </div>
          </main>
        </div>
      </AssistantRuntimeProvider>
    </RecipeContext.Provider>
  );
}
