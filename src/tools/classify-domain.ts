import { kbStore } from "../lib/kb-store.js";
import type { ClassifyResult } from "../lib/types.js";

const DEFAULT_THRESHOLD = 0.40;

function getThreshold(): number {
  const env = process.env.SIMILARITY_THRESHOLD;
  if (env) {
    const parsed = parseFloat(env);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
  }
  return DEFAULT_THRESHOLD;
}

/**
 * Embeds the user request and finds the most semantically similar domain
 * in the knowledge base. Returns "unknown" if the best match score is
 * below the configured threshold.
 */
export async function classifyDomain(
  userRequest: string
): Promise<ClassifyResult> {
  const threshold = getThreshold();
  const { entry, score } = await kbStore.findBestDomain(userRequest);

  if (score >= threshold) {
    kbStore.incrementUsage(entry.domain_key);
    return {
      domain_key: entry.domain_key,
      display_name: entry.display_name,
      similarity_score: Math.round(score * 1000) / 1000,
    };
  }

  return {
    domain_key: "unknown",
    display_name: "Unknown Domain",
    similarity_score: Math.round(score * 1000) / 1000,
    best_candidate: entry.domain_key,
  };
}
