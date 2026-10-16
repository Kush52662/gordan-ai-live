// Real Gemini + LiveKit debugger against isolated, in-memory application state.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { emptyKitchen, transition } from "../apps/web/lib/kitchen/model.ts";
import {
  agentContext,
  requestedRecipe,
} from "../apps/web/lib/kitchen/context.ts";
const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "apps/agent/package.json"));
require("dotenv").config({
  path: resolve(root, "apps/agent/.env.local"),
  quiet: true,
});
const cached = resolve(homedir(), ".cache/gordon-on-call/livekit-2.19.0/lk");
const lk = existsSync(cached) ? cached : "lk";
const token = crypto.randomUUID();
let state = emptyKitchen();
const recipe = {
  title: "Simple rice",
  servings: 2,
  ingredients: [
    { name: "rice", amount: 100, unit: "g" },
    { name: "water", amount: 200, unit: "ml" },
  ],
  steps: [
    {
      id: "rinse",
      stage: "prep",
      instruction: "Rinse the rice and measure the water.",
    },
    {
      id: "simmer",
      stage: "cook",
      instruction:
        "Simmer rice with water until tender, checking before serving.",
    },
    { id: "serve", stage: "plate", instruction: "Spoon rice into two bowls." },
  ],
};
state = transition(state, {
  revision: 0,
  commandId: crypto.randomUUID(),
  action: { type: "save_recipe", recipe },
});
const streams = new Set();
const conversation = [];
const publish = () => {
  for (const response of streams) response.write(`data: ${JSON.stringify(agentContext(state))}\n\n`);
};
const api = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.headers.authorization !== `Bearer ${token}`) {
    response
      .writeHead(401)
      .end(JSON.stringify({ error: "Unauthorized fixture access" }));
    return;
  }
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/kitchen/stream") {
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      streams.add(response);
      response.write(`data: ${JSON.stringify(agentContext(state))}\n\n`);
      request.on("close", () => streams.delete(response));
      return;
    }
    let command;
    if (request.method === "POST") {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 250000) throw new Error("Request too large");
      }
      command = JSON.parse(body);
    }
    if (url.pathname === "/api/conversation") {
      if (command) {
        assert.equal(command.ownerUid, "local-evaluation");
        for (const turn of command.history ?? []) {
          const i = conversation.findIndex(t => t.id === turn.id);
          if (i < 0) conversation.push(turn); else conversation[i] = turn;
        }
      }
      response.end(JSON.stringify({ownerUid:"local-evaluation", history:conversation}));
      return;
    }
    if (command) {
      state = transition(state, command);
      publish();
    }
    const id = url.searchParams.get("recipeId");
    response.end(
      JSON.stringify(
        id
          ? { revision: state.revision, recipe: requestedRecipe(state, id) }
          : agentContext(state),
      ),
    );
  } catch (error) {
    response.writeHead(422).end(JSON.stringify({ error: error.message }));
  }
});
await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
const env = {
  ...process.env,
  GORDON_API_URL: `http://127.0.0.1:${api.address().port}`,
  GORDON_DEBUG_KITCHEN_TOKEN: token,
};
const port = String(process.env.GORDON_EVAL_PORT ?? 8778);
async function command(action, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      lk,
      ["agent", "debugger", action, "--port", port, ...args],
      {
        cwd: resolvePath(),
        env,
      },
    );
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Agent evaluation timed out."));
    }, 90000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0
        ? resolve(output)
        : reject(new Error(output.replaceAll(token, "[redacted]")));
    });
  });
}
function resolvePath() {
  return resolve(root, "apps/agent");
}
async function say(text) {
  const sentAt = Date.now();
  let turn;
  try {
    turn = JSON.parse(await command("say", "--json", "--timeout", "60s", text));
  } catch (error) {
    // NON_BLOCKING tools can outlive the debugger's first quiet window. Wait for
    // the actual reply, without re-sending the cook's request or duplicating actions.
    if (!String(error).includes("agent produced no response items"))
      throw error;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const history = JSON.parse(
        await command("chat-history", "--json"),
      ).events;
      const replies = history.filter(
        (event) =>
          event.type === "message" &&
          event.role === "assistant" &&
          Date.parse(event.time) >= sentAt,
      );
      if (replies.length) {
        turn = { text, reply: replies.map((event) => event.text).join(" ") };
        break;
      }
    }
    if (!turn) throw error;
  }
  console.log(`Heard: ${turn.text ?? turn.input ?? "see transcript"}`);
  const reply =
    typeof turn.reply === "string"
      ? turn.reply
      : JSON.stringify(turn.reply ?? turn);
  console.log(`Cook: ${text}\nGordon: ${reply}\n`);
  assert.ok(reply && reply !== '\"\"', "The cook received no response.");
  return reply;
}
async function waitFor(check, label, reply) {
  const deadline = Date.now() + 30000;
  while (!check() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(check(), `${label}\n${reply}`);
}
try {
  const start = () =>
    command(
      "start",
      "--idle-timeout",
      "5m",
      ...(process.argv.includes("--audio") ? ["--audio"] : []),
    );
  await start();
  await say("Hello Gordon AI.");
  if (process.argv.includes("--mix")) {
    if (!process.argv.includes("--handoff-only")) {
      const startMix = await say("What do I need for an MTR gulab jamun mix?");
      assert.match(
        startMix,
        /packet|pack|label|direction|instruction|size/i,
        "Ask about the mix before inventing measurements.",
      );
      const unsure = await say(
        "I don't know the packet size and can't read the instructions right now. First help me plan it, I'm not ready to cook.",
      );
      assert.doesNotMatch(
        unsure,
        /(?:two|2) cups|(?:twenty|20) servings|\b(?:go ahead(?: and)?|start by|first,?) (?:add|mix|pour|heat)\b/i,
        "Do not invent measurements or start physical coaching.",
      );
      assert.equal(
        state.choices?.length ?? 0,
        0,
        "No recipe with invented quantities should be displayed.",
      );
      assert.equal(state.meal, null);
    }
    await command("stop");
    // A separate, fully specified proposal exercises the approval that failed in
    // the real call; these fixture quantities are not claims about a retail mix.
    state = transition(state, {
      revision: state.revision,
      commandId: crypto.randomUUID(),
      action: { type: "propose_recipes", recipes: [recipe] },
    });
    await start();
    await say("Hello Gordon AI.");
    const proceed = await say(
      "Let's prepare that displayed Simple rice recipe.",
    );
    await waitFor(
      () => state.meal?.stage === "prep",
      "Displayed recipe did not start",
      proceed,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const history = JSON.parse(await command("chat-history", "--json")).events;
    const lastUser = history.findLastIndex(
      (event) => event.type === "message" && event.role === "user",
    );
    const replies = history
      .slice(lastUser + 1)
      .filter(
        (event) => event.type === "message" && event.role === "assistant",
      );
    const spoken = replies.map((event) => event.text).join(" ");
    assert.equal(
      replies.filter((event) => /rins(?:e|ing)/i.test(event.text)).length,
      1,
      "The first action should be spoken once.",
    );
    assert.doesNotMatch(
      spoken,
      /saved.*library|now saved|set aside|bring.*simmer/i,
      "Do not narrate saves or continue into later actions.",
    );
    assert.equal(state.meal.completed.length, 0);
    console.log(
      process.argv.includes("--handoff-only")
        ? "PASS: displayed recipe approved in one action; first instruction spoken once; waited for cook."
        : "PASS: mix uncertainty respected; displayed recipe approved in one action; first instruction spoken once; waited for cook.",
    );
  } else {
    const timerReply = await say("Set an oven timer for twenty seconds.");
    await waitFor(
      () => state.timers?.some((t) => t.label.toLowerCase() === "oven"),
      "Independent timer was not started",
      timerReply,
    );
    assert.equal(state.meal, null, "A timer must not require creating a meal.");
    const explanation = await say(
      "While that's running, why do onions turn sweet? Short version please.",
    );
    assert.match(explanation, /sugar|sweet|carameli|cook/i);
    const due = state.timers.find((t) => t.label.toLowerCase() === "oven");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, due.deadline - Date.now()) + 8000),
    );
    if (!process.argv.includes("--audio"))
      await say("Please check the actual oven timer status. Is it due now?");
    const history = await command("chat-history", "--json");
    const messages = JSON.parse(history);
    console.log("Timer history captured for spoken alert review.");
    const alerts = messages.events.filter(
      (event) =>
        event.type === "message" &&
        event.role === "assistant" &&
        /oven/i.test(event.text ?? "") &&
        /check|up|due|ready|finished|off/i.test(event.text ?? ""),
    );
    assert.ok(alerts.length, "No spoken timer alert was recorded.");
    console.log(`Timer alert: ${alerts.at(-1).text}`);
    const acknowledged = await say(
      "I heard the oven timer. Acknowledge that timer please.",
    );
    await waitFor(
      () =>
        state.timers.some(
          (t) => t.id === due.id && t.status === "acknowledged",
        ),
      "Timer was not acknowledged",
      acknowledged,
    );
    const prep = await say(
      "Let's use my saved Simple rice recipe. I have the full 100 g rice and 200 ml water and explicitly accept that ingredient list. Start preparation. Remember I'm cooking for two, have one pot and a stove, and I need to avoid peanuts.",
    );
    await waitFor(
      () => state.meal?.stage === "prep",
      "Preparation did not start",
      prep,
    );
    const cook = await say(
      "I've rinsed the rice and measured the water. All preparation is done and I'm starting to cook now.",
    );
    await waitFor(
      () => state.meal?.stage === "cook" && state.meal.startedAt !== null,
      "The main elapsed clock did not start",
      cook,
    );
    console.log(
      "PASS: spoken technique answer, real named timer alert, saved preparation and main cooking clock.",
    );
  }
} finally {
  await command("stop").catch(() => {});
  api.closeAllConnections();
  api.close();
}
