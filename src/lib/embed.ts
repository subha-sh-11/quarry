// On-device sentence embeddings (all-MiniLM-L6-v2, ~23 MB, cached by the browser after first load).
type Status = 'idle' | 'loading' | 'ready' | 'error';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const listeners = new Set<() => void>();

export const model = { status: 'idle' as Status, progress: 0, error: '' };

function emit() {
  listeners.forEach((l) => l());
}

export function onModel(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function ensure() {
  if (worker) return worker;
  worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      model.progress = m.value;
      emit();
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.type === 'error') p.reject(new Error(m.message));
    else p.resolve(m);
  };
  return worker;
}

function send(msg: object): Promise<any> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensure().postMessage({ id, ...msg });
  });
}

let loading: Promise<boolean> | null = null;

export function loadModel(): Promise<boolean> {
  if (model.status === 'ready') return Promise.resolve(true);
  if (loading) return loading;
  model.status = 'loading';
  model.error = '';
  emit();
  loading = send({ type: 'load' })
    .then(() => {
      model.status = 'ready';
      model.progress = 100;
      emit();
      return true;
    })
    .catch((e) => {
      model.status = 'error';
      model.error = e.message;
      loading = null;
      emit();
      return false;
    });
  return loading;
}

export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];
  if (!(await loadModel())) return null;
  try {
    const r = await send({ type: 'embed', texts });
    return r.vectors;
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectors are normalised
}
