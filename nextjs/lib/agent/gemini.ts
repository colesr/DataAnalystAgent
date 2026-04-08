/**
 * Gemini (Google) streaming agent runner.
 *
 * Same shape as the Claude runner: yields AgentEvents, loops on tool use.
 * Internally uses generateContentStream + manual function-calling loop.
 */
import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type FunctionDeclarationSchema,
  type FunctionDeclarationSchemaProperty,
  type Schema,
  SchemaType,
} from "@google/generative-ai";
import { tools as agentTools, findTool } from "./tools";
import {
  SYSTEM_PROMPT,
  type AgentEvent,
  type AgentRunOptions,
  type ChartSpec,
  type ToolContext,
} from "./types";

const MAX_TURNS = 12;

/** Translate a JSON-schema-style fragment into Gemini's stricter Schema. */
function toGeminiSchema(s: any): Schema {
  if (!s || typeof s !== "object") return { type: SchemaType.STRING };
  const out: Schema = {};
  switch (s.type) {
    case "object":
      out.type = SchemaType.OBJECT;
      break;
    case "array":
      out.type = SchemaType.ARRAY;
      break;
    case "string":
      out.type = SchemaType.STRING;
      break;
    case "number":
      out.type = SchemaType.NUMBER;
      break;
    case "integer":
      out.type = SchemaType.INTEGER;
      break;
    case "boolean":
      out.type = SchemaType.BOOLEAN;
      break;
    default:
      out.type = SchemaType.STRING;
  }
  if (typeof s.description === "string") out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum;
  if (out.type === SchemaType.OBJECT && s.properties) {
    out.properties = {};
    for (const k of Object.keys(s.properties)) {
      out.properties[k] = toGeminiSchema(s.properties[k]);
    }
    if (Array.isArray(s.required)) out.required = s.required;
  }
  if (out.type === SchemaType.ARRAY) {
    // Gemini requires `items` to have a type — fall back to STRING for empty.
    out.items = s.items ? toGeminiSchema(s.items) : { type: SchemaType.STRING };
  }
  return out;
}

function toGeminiToolDecls(): FunctionDeclaration[] {
  return agentTools.map((t) => {
    const schema = toGeminiSchema(t.input_schema);
    // Gemini's top-level parameters must be an OBJECT schema with properties.
    const parameters: FunctionDeclarationSchema = {
      type: SchemaType.OBJECT,
      properties:
        (schema.properties as { [k: string]: FunctionDeclarationSchemaProperty }) ?? {},
      required: schema.required,
    };
    return {
      name: t.name,
      description: t.description,
      parameters,
    };
  });
}

export async function* runGemini(opts: AgentRunOptions): AsyncIterable<AgentEvent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    yield { type: "error", message: "GEMINI_API_KEY is not set on the server" };
    yield { type: "done", reason: "error" };
    return;
  }

  const modelId = opts.model.replace(/^gemini:/, "");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_PROMPT,
    tools: [{ functionDeclarations: toGeminiToolDecls() }],
  });

  yield { type: "start", model: modelId };

  const ctx: ToolContext = {
    workspaceId: opts.workspace.id,
    schemaName: opts.workspace.schemaName,
    charts: [],
  };

  // Conversation history. Gemini uses "user" / "model" roles, not "assistant".
  const contents: Content[] = [
    { role: "user", parts: [{ text: opts.question }] },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let result;
    try {
      result = await model.generateContentStream(
        { contents },
        opts.signal ? { signal: opts.signal } : undefined
      );
    } catch (e: any) {
      yield { type: "error", message: e?.message ?? String(e) };
      yield { type: "done", reason: "error" };
      return;
    }

    // Stream text deltas live.
    try {
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) yield { type: "text", delta: text };
      }
    } catch (e: any) {
      yield { type: "error", message: e?.message ?? String(e) };
      yield { type: "done", reason: "error" };
      return;
    }

    // Pull the assembled response (includes any function calls).
    const finalResp = await result.response;
    const candidate = finalResp.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    // Persist the model turn into history.
    contents.push({ role: "model", parts });

    const fnCalls = parts
      .filter((p): p is { functionCall: { name: string; args: any } } =>
        Boolean((p as any).functionCall)
      )
      .map((p) => p.functionCall);

    if (fnCalls.length === 0) {
      yield { type: "done", reason: "stop" };
      return;
    }

    // Execute every function call, then send results back as a single user turn.
    const toolResultParts: { functionResponse: { name: string; response: any } }[] = [];
    for (const call of fnCalls) {
      const id = `${call.name}-${turn}-${Math.random().toString(36).slice(2, 8)}`;
      yield { type: "tool_use", id, name: call.name, input: call.args };
      const tool = findTool(call.name);
      if (!tool) {
        const err = `Unknown tool: ${call.name}`;
        yield { type: "tool_result", id, name: call.name, error: err };
        toolResultParts.push({
          functionResponse: { name: call.name, response: { error: err } },
        });
        continue;
      }
      try {
        const out = await tool.execute(call.args, ctx);
        yield { type: "tool_result", id, name: call.name, output: out };
        if (call.name === "render_chart") {
          yield { type: "chart", spec: call.args as ChartSpec };
        }
        // Gemini wants the response wrapped under a `response` field.
        toolResultParts.push({
          functionResponse: { name: call.name, response: { result: out } },
        });
      } catch (e: any) {
        const err = e?.message ?? String(e);
        yield { type: "tool_result", id, name: call.name, error: err };
        toolResultParts.push({
          functionResponse: { name: call.name, response: { error: err } },
        });
      }
    }

    contents.push({ role: "user", parts: toolResultParts as any });
  }

  yield { type: "done", reason: "max_turns" };
}
