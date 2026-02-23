import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { classifyDomain } from "./tools/classify-domain.js";
import { enrichPrompt } from "./tools/enrich-prompt.js";
import { addDomain } from "./tools/add-domain.js";
import { kbStore } from "./lib/kb-store.js";
import type { DomainQuestion } from "./lib/types.js";

const server = new Server(
  { name: "prompt-enrichment-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "classify_domain",
      description:
        "Embeds the user's request and finds the most semantically similar domain in the knowledge base. " +
        "Returns the matched domain key and similarity score. " +
        "Returns domain_key 'unknown' (with best_candidate) when no domain scores above the threshold. " +
        "Always call this first, then call enrich_prompt with the returned domain_key.",
      inputSchema: {
        type: "object",
        properties: {
          user_request: {
            type: "string",
            description:
              "The user's raw task description (with the /pe trigger keyword already stripped).",
          },
        },
        required: ["user_request"],
      },
    },
    {
      name: "enrich_prompt",
      description:
        "Returns a prompt delegation object for the host LLM. " +
        "For known domains, provides curated example questions as a reference framework. " +
        "For 'unknown' domains, provides universal discovery dimensions. " +
        "Follow the 'steps' in the returned object exactly.",
      inputSchema: {
        type: "object",
        properties: {
          user_request: {
            type: "string",
            description: "The user's original request (trigger keyword stripped).",
          },
          domain_key: {
            type: "string",
            description:
              "The domain_key returned by classify_domain. Pass 'unknown' if classification returned unknown.",
          },
        },
        required: ["user_request", "domain_key"],
      },
    },
    {
      name: "add_domain",
      description:
        "Adds a new domain entry to the knowledge base. " +
        "Call this after completing a task in an unknown domain, passing the domain name, description, " +
        "an example of the user's request, and the clarifying questions that were generated. " +
        "New entries are saved with review_status 'pending' for maintainer review.",
      inputSchema: {
        type: "object",
        properties: {
          domain_name: {
            type: "string",
            description:
              "A short, descriptive name for the new domain (e.g., 'ML Curriculum Design').",
          },
          description: {
            type: "string",
            description:
              "A one-sentence description of what this domain covers.",
          },
          example_requests: {
            type: "array",
            items: { type: "string" },
            description:
              "One or more example user requests that belong to this domain.",
          },
          questions: {
            type: "array",
            description: "The clarifying questions generated for this domain.",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                options: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["question", "options"],
            },
          },
        },
        required: ["domain_name", "description", "example_requests", "questions"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "classify_domain") {
      const userRequest = args?.user_request as string;
      if (!userRequest) throw new Error("user_request is required.");
      const result = await classifyDomain(userRequest);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "enrich_prompt") {
      const userRequest = args?.user_request as string;
      const domainKey = args?.domain_key as string;
      if (!userRequest) throw new Error("user_request is required.");
      if (!domainKey) throw new Error("domain_key is required.");
      const result = enrichPrompt(userRequest, domainKey);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "add_domain") {
      const domainName = args?.domain_name as string;
      const description = args?.description as string;
      const exampleRequests = args?.example_requests as string[];
      const questions = args?.questions as DomainQuestion[];
      if (!domainName) throw new Error("domain_name is required.");
      if (!description) throw new Error("description is required.");
      if (!exampleRequests?.length) throw new Error("example_requests is required.");
      if (!questions?.length) throw new Error("questions is required.");
      const result = await addDomain(domainName, description, exampleRequests, questions);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  // Connect immediately so Cursor sees the server as ready.
  // KB initialization and model download happen on the first tool call.
  process.stderr.write("[prompt-enrichment-mcp] Server starting...\n");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[prompt-enrichment-mcp] Ready. KB and embedding model will load on first use.\n");
}

main().catch((err) => {
  process.stderr.write(`[prompt-enrichment-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
