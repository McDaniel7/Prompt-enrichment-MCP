/**
 * Computes the cosine similarity between two vectors.
 * Both vectors should already be L2-normalized (as produced by the embedding model)
 * in which case this reduces to a simple dot product, but we compute the full
 * formula for safety.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector length mismatch: ${a.length} vs ${b.length}`
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Finds the index with the highest cosine similarity to the query vector.
 * Returns the index and score.
 */
export function findBestMatch(
  query: number[],
  candidates: number[][]
): { index: number; score: number } {
  let bestIndex = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const score = cosineSimilarity(query, candidates[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return { index: bestIndex, score: bestScore };
}
