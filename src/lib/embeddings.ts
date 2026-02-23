import { pipeline } from "@huggingface/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// Use a minimal callable type to avoid TS2590 (union type too complex).
// The pipeline returns a function that accepts text and pooling options.
type EmbedPipeline = (
  input: string,
  options: { pooling: string; normalize: boolean }
) => Promise<{ data: Float32Array }>;

let embedder: EmbedPipeline | null = null;
let initPromise: Promise<EmbedPipeline> | null = null;

/**
 * Returns a singleton embedding pipeline, downloading the model on first call.
 * Subsequent calls reuse the cached pipeline without re-downloading.
 */
async function getEmbedder(): Promise<EmbedPipeline> {
  if (embedder) return embedder;
  if (initPromise) return initPromise;

  initPromise = pipeline("feature-extraction", MODEL_NAME, {
    dtype: "q8",  // 8-bit quantized — smaller download, same quality for similarity tasks
  }) as unknown as Promise<EmbedPipeline>;

  embedder = await initPromise;
  return embedder;
}

/**
 * Embeds a string into a normalized float32 vector (384 dims for MiniLM-L6-v2).
 */
export async function embed(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * Pre-warms the embedding model. Call on server startup to avoid latency
 * on the first real request.
 */
export async function warmUp(): Promise<void> {
  await embed("warm up");
}
