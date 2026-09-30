/// <reference lib="webworker" />
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

env.allowLocalModels = false;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function load() {
  extractor ??= pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'q8',
    progress_callback: (p: any) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) self.postMessage({ type: 'progress', value: Math.round(p.progress ?? 0) });
    },
  }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, texts } = e.data;
  try {
    const ex = await load();
    if (type === 'load') return self.postMessage({ id, type: 'ready' });
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 32) {
      const batch = texts.slice(i, i + 32).map((t: string) => t.slice(0, 512));
      const t = await ex(batch, { pooling: 'mean', normalize: true });
      out.push(...(t.tolist() as number[][]));
    }
    self.postMessage({ id, type: 'result', vectors: out });
  } catch (err) {
    extractor = null;
    self.postMessage({ id, type: 'error', message: String((err as Error)?.message ?? err) });
  }
};
