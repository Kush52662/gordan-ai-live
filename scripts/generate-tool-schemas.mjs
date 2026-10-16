// Recipe, memory and ingredient-check inputs shared with the conversational tools.
import { writeFileSync } from "node:fs";
import { z } from "../apps/web/node_modules/zod/index.js";
import { actionSchema } from "../apps/web/lib/kitchen/model.ts";
const names = new Set(["propose_ingredients", "update_brief", "propose_recipes", "save_recipe", "check_ingredients", "update_recipe_document", "update_cooking_session"]);
const inputs = actionSchema.options
  .filter((schema) => names.has(schema.shape.type.value))
  .map((schema) => {
    const json = z.toJSONSchema(schema);
    delete json.$schema;
    delete json.properties.type;
    json.required = (json.required ?? []).filter((key) => key !== "type");
    return { name: schema.shape.type.value, parameters: json };
  });
writeFileSync(
  new URL("../apps/agent/src/tool-schemas.json", import.meta.url),
  JSON.stringify(inputs, null, 2) + "\n",
);
