import { useRef, useSyncExternalStore } from 'react';
import { del, get, set } from 'idb-keyval';
import type { Recipe, Run, RunData, Settings } from './types';
import { startRun, type RunHandle } from './engine';
import { loadModel } from './embed';

interface State {
  loaded: boolean;
  recipes: Recipe[];
  runs: Run[];
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = { planner: 'local', anthropicKey: '', githubToken: '', semantic: true };

let state: State = { loaded: false, recipes: [], runs: [], settings: DEFAULT_SETTINGS };
const subs = new Set<() => void>();
const dataCache = new Map<string, RunData>();
const handles = new Map<string, RunHandle>();

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

/** Selector results are cached per state version so derived arrays keep a stable identity. */
export function useStore<T>(sel: (s: State) => T): T {
  const cache = useRef<{ s: State; v: T } | null>(null);
  const snap = () => {
    if (cache.current?.s === state) return cache.current.v;
    const v = sel(state);
    cache.current = { s: state, v };
    return v;
  };
  return useSyncExternalStore(subscribe, snap);
}

export const getState = () => state;

const safe = async <T>(p: Promise<T>, fallback: T) => {
  try {
    return (await p) ?? fallback;
  } catch {
    return fallback;
  }
};

let persistTimer: number | undefined;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void safe(set('recipes', state.recipes), undefined);
    void safe(set('runs', state.runs.filter((r) => r.status !== 'running')), undefined);
  }, 250);
}

export async function boot() {
  const [recipes, runs, settings] = await Promise.all([safe(get<Recipe[]>('recipes'), []), safe(get<Run[]>('runs'), []), safe(get<Settings>('settings'), DEFAULT_SETTINGS)]);
  setState({ loaded: true, recipes, runs, settings: { ...DEFAULT_SETTINGS, ...settings } });
  if (state.settings.semantic) setTimeout(() => void loadModel(), 1500);
  setInterval(tickWatch, 20000);
}

export function updateSettings(patch: Partial<Settings>) {
  setState({ settings: { ...state.settings, ...patch } });
  void safe(set('settings', state.settings), undefined);
  if (patch.semantic) void loadModel();
}

export function saveRecipe(r: Recipe) {
  const exists = state.recipes.some((x) => x.id === r.id);
  setState({ recipes: exists ? state.recipes.map((x) => (x.id === r.id ? { ...r, updatedAt: Date.now() } : x)) : [r, ...state.recipes] });
  persist();
}

export function deleteRecipe(id: string) {
  const runs = state.runs.filter((r) => r.recipeId === id);
  runs.forEach((r) => {
    handles.get(r.id)?.cancel();
    void safe(del(`data:${r.id}`), undefined);
    dataCache.delete(r.id);
  });
  setState({ recipes: state.recipes.filter((r) => r.id !== id), runs: state.runs.filter((r) => r.recipeId !== id) });
  persist();
}

export function deleteRun(id: string) {
  handles.get(id)?.cancel();
  dataCache.delete(id);
  void safe(del(`data:${id}`), undefined);
  setState({ runs: state.runs.filter((r) => r.id !== id) });
  persist();
}

export async function getRunData(id: string): Promise<RunData | null> {
  if (dataCache.has(id)) return dataCache.get(id)!;
  const d = (await safe(get<RunData>(`data:${id}`), null as RunData | null)) ?? null;
  if (d) dataCache.set(id, d);
  return d;
}

export function peekRunData(id: string) {
  return dataCache.get(id) ?? null;
}

export const isLive = (runId: string) => handles.has(runId);

export async function runRecipe(recipe: Recipe, trigger: Run['trigger'] = 'manual'): Promise<string> {
  saveRecipe(recipe);
  const prevRun = state.runs.find((r) => r.recipeId === recipe.id && r.status === 'done');
  const prevData = prevRun ? await getRunData(prevRun.id) : null;
  const handle = startRun(recipe, {
    trigger,
    previous: prevRun && prevData ? { run: prevRun, data: prevData } : null,
    semantic: state.settings.semantic,
    githubToken: state.settings.githubToken || undefined,
    onUpdate: (run, data) => {
      if (data) {
        dataCache.set(run.id, data);
        void safe(set(`data:${run.id}`, data), undefined);
        handles.delete(run.id);
      }
      const has = state.runs.some((r) => r.id === run.id);
      setState({ runs: has ? state.runs.map((r) => (r.id === run.id ? run : r)) : [run, ...state.runs] });
      if (data) persist();
    },
  });
  handles.set(handle.run.id, handle);
  if (!state.runs.some((r) => r.id === handle.run.id)) setState({ runs: [structuredClone(handle.run), ...state.runs] });
  if (recipe.watch) saveRecipe({ ...recipe, watch: { ...recipe.watch, nextAt: Date.now() + recipe.watch.everyMin * 60000 } });
  pruneHistory(recipe.id);
  return handle.run.id;
}

export function cancelRun(id: string) {
  handles.get(id)?.cancel();
}

function pruneHistory(recipeId: string) {
  const runs = state.runs.filter((r) => r.recipeId === recipeId);
  const extra = runs.slice(20);
  if (!extra.length) return;
  extra.forEach((r) => void safe(del(`data:${r.id}`), undefined));
  const drop = new Set(extra.map((r) => r.id));
  setState({ runs: state.runs.filter((r) => !drop.has(r.id)) });
}

export function setWatch(recipe: Recipe, everyMin: number | null) {
  saveRecipe({ ...recipe, watch: everyMin ? { everyMin, nextAt: Date.now() + everyMin * 60000 } : null });
}

function tickWatch() {
  const now = Date.now();
  for (const r of state.recipes) {
    if (!r.watch?.nextAt || r.watch.nextAt > now) continue;
    const busy = state.runs.some((x) => x.recipeId === r.id && x.status === 'running');
    if (!busy) void runRecipe(r, 'watch');
  }
}

export async function clearAll() {
  handles.forEach((h) => h.cancel());
  await Promise.all(state.runs.map((r) => safe(del(`data:${r.id}`), undefined)));
  await safe(del('recipes'), undefined);
  await safe(del('runs'), undefined);
  dataCache.clear();
  setState({ recipes: [], runs: [] });
}
