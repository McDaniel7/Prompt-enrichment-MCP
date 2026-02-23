import { kbStore } from "../lib/kb-store.js";
import type { EnrichPromptResult } from "../lib/types.js";

const KNOWN_DOMAIN_STEPS = [
  "1. Review the example_questions below. These are curated questions for this domain — use them as a reference framework, NOT as a verbatim script.",
  "2. Generate 6–8 clarifying questions tailored to the user's SPECIFIC request. Adapt the examples to match what the user actually described (e.g., if their request involves image resizing, ask about image formats and output destinations, not generic Lambda questions).",
  "3. Present the questions to the user as a numbered multiple-choice list. Wait for their answers.",
  "4. Assemble an expert-level enriched prompt by combining the user's original request with their answers. The enriched prompt should be detailed, specific, and ready to pass directly to an AI agent.",
  "5. Show the enriched prompt to the user for confirmation before proceeding with the actual task.",
];

const UNKNOWN_DOMAIN_STEPS = [
  "1. The user's request does not match any domain in the knowledge base. Use the discovery_dimensions below as a structured framework.",
  "2. For each relevant dimension, generate a tailored multiple-choice question (3–5 options) specific to what the user described. Skip dimensions that clearly do not apply.",
  "3. Present the questions to the user as a numbered multiple-choice list. Wait for their answers.",
  "4. Assemble an expert-level enriched prompt by combining the user's original request with their answers.",
  "5. Show the enriched prompt to the user for confirmation before proceeding with the actual task.",
  "6. After the task completes, call the add_domain tool with: an inferred domain name and description, the user's original request as an example, and the questions you generated. This grows the knowledge base.",
];

/**
 * Builds and returns a prompt delegation object for the host LLM.
 * For known domains, returns curated example questions as a reference.
 * For unknown domains, returns the universal discovery dimensions as a fallback framework.
 */
export function enrichPrompt(
  userRequest: string,
  domainKey: string
): EnrichPromptResult {
  if (domainKey === "unknown") {
    const { dimensions } = kbStore.getDiscoveryDimensions();
    return {
      user_request: userRequest,
      matched_domain: null,
      instruction:
        "This request did not match any domain in the knowledge base. Use the discovery_dimensions as a framework to generate tailored clarifying questions.",
      steps: UNKNOWN_DOMAIN_STEPS,
      example_questions: null,
      discovery_dimensions: dimensions,
    };
  }

  const entry = kbStore.getDomainByKey(domainKey);
  if (!entry) {
    throw new Error(`Domain key not found in knowledge base: ${domainKey}`);
  }

  return {
    user_request: userRequest,
    matched_domain: entry.display_name,
    instruction: `This request matches the "${entry.display_name}" domain. Use the example_questions as a reference to generate tailored clarifying questions.`,
    steps: KNOWN_DOMAIN_STEPS,
    example_questions: entry.questions,
    discovery_dimensions: null,
  };
}
