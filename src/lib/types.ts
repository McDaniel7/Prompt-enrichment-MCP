export interface DomainQuestion {
  question: string;
  options: string[];
}

export interface DomainEntry {
  domain_key: string;
  display_name: string;
  description: string;
  example_requests: string[];
  questions: DomainQuestion[];
  embedding?: number[];
  metadata: {
    source: "curated" | "generated";
    created_at: string;
    usage_count: number;
    last_used: string | null;
    review_status: "approved" | "pending";
  };
}

export interface DiscoveryDimension {
  name: string;
  probe: string;
}

export interface DiscoveryDimensions {
  dimensions: DiscoveryDimension[];
}

export interface ClassifyResult {
  domain_key: string;
  display_name: string;
  similarity_score: number;
  best_candidate?: string;
}

export interface EnrichPromptResult {
  user_request: string;
  matched_domain: string | null;
  instruction: string;
  steps: string[];
  example_questions: DomainQuestion[] | null;
  discovery_dimensions: DiscoveryDimension[] | null;
}
