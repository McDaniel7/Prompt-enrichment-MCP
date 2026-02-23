import { kbStore } from "../lib/kb-store.js";
import type { DomainEntry, DomainQuestion } from "../lib/types.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Adds a new domain to the knowledge base from a generated (unknown-domain) interaction.
 * Computes the embedding for the new entry and persists it to disk.
 * New entries are marked as source "generated" and review_status "pending".
 */
export async function addDomain(
  domainName: string,
  description: string,
  exampleRequests: string[],
  questions: DomainQuestion[]
): Promise<{ domain_key: string; message: string }> {
  const domainKey = slugify(domainName);

  if (!domainKey) {
    throw new Error("domain_name must be a non-empty string.");
  }
  if (!description.trim()) {
    throw new Error("description must be a non-empty string.");
  }
  if (exampleRequests.length === 0) {
    throw new Error("example_requests must contain at least one entry.");
  }
  if (questions.length === 0) {
    throw new Error("questions must contain at least one entry.");
  }

  const existing = kbStore.getDomainByKey(domainKey);
  if (existing) {
    return {
      domain_key: domainKey,
      message: `Domain "${domainKey}" already exists in the knowledge base. No changes made.`,
    };
  }

  const today = new Date().toISOString().split("T")[0];
  const entry: DomainEntry = {
    domain_key: domainKey,
    display_name: domainName,
    description,
    example_requests: exampleRequests,
    questions,
    metadata: {
      source: "generated",
      created_at: today,
      usage_count: 0,
      last_used: null,
      review_status: "pending",
    },
  };

  await kbStore.addDomain(entry);

  return {
    domain_key: domainKey,
    message: `New domain "${domainKey}" added to the knowledge base with review_status "pending". A maintainer can promote it to "approved" after review.`,
  };
}
