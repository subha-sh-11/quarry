import { BookMarked, Database, History, LayoutGrid, Plus, Settings2, ShieldCheck } from 'lucide-react';
import { Logo, Toaster, useModel, useRoute } from './components/ui';
import { useStore } from './lib/store';
import Overview from './pages/Overview';
import Compose from './pages/Compose';
import RunPage from './pages/RunPage';
import Recipes from './pages/Recipes';
import Runs from './pages/Runs';
import SourcesPage from './pages/Sources';
import SettingsPage from './pages/Settings';

export default function App() {
  const { parts } = useRoute();
  const loaded = useStore((s) => s.loaded);
  const recipes = useStore((s) => s.recipes.length);
  const runs = useStore((s) => s.runs);
  const live = runs.filter((r) => r.status === 'running').length;
  const m = useModel();
  const semantic = useStore((s) => s.settings.semantic);
  const planner = useStore((s) => s.settings.planner);
  const hasKey = useStore((s) => !!s.settings.anthropicKey);

  const at = parts[0] ?? '';
  const nav = [
    { to: '', label: 'Overview', icon: LayoutGrid },
    { to: 'new', label: 'New collection', icon: Plus },
    { to: 'recipes', label: 'Recipes', icon: BookMarked, count: recipes },
    { to: 'runs', label: 'Runs', icon: History, count: live ? `${live} live` : runs.length },
    { to: 'sources', label: 'Sources', icon: ShieldCheck },
    { to: 'settings', label: 'Settings', icon: Settings2 },
  ];
  const active = (to: string) => (to === '' ? at === '' : at === to || (to === 'recipes' && at === 'recipe') || (to === 'runs' && at === 'run'));

  let page = <Overview />;
  if (at === 'new') page = <Compose key="new" />;
  else if (at === 'recipe' && parts[2] === 'edit') page = <Compose key={parts[1]} recipeId={parts[1]} />;
  else if (at === 'run') page = <RunPage key={parts[1]} runId={parts[1]} />;
  else if (at === 'recipes') page = <Recipes />;
  else if (at === 'runs') page = <Runs />;
  else if (at === 'sources') page = <SourcesPage />;
  else if (at === 'settings') page = <SettingsPage />;

  const modelLabel = !semantic ? 'Semantic model off' : m.status === 'ready' ? 'On-device model ready' : m.status === 'loading' ? `Loading model ${m.progress}%` : m.status === 'error' ? 'Model unavailable' : 'Model idle';

  return (
    <div className="shell">
      <aside className="side">
        <a href="#/" className="brand">
          <Logo />
          <div>
            <div className="brand-name">Quarry</div>
            <div className="brand-tag">Every cell has a receipt</div>
          </div>
        </a>
        <nav className="nav">
          {nav.map((n) => (
            <a key={n.to} href={`#/${n.to}`} className={active(n.to) ? 'on' : ''}>
              <n.icon />
              {n.label}
              {n.count ? <span className="count">{n.count}</span> : null}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="model-line">
            <span className={`dot ${m.status === 'ready' && semantic ? 'green' : m.status === 'loading' ? 'blue pulse' : m.status === 'error' ? 'clay' : ''}`} />
            {modelLabel}
          </div>
          <div className="model-line">
            <Database size={13} />
            Planner: {planner === 'claude' && hasKey ? 'Claude' : 'on-device'}
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <a href="#/" className="row" style={{ gap: 8 }}>
            <Logo size={24} />
            <b style={{ letterSpacing: '-.02em' }}>Quarry</b>
          </a>
          <nav className="topnav">
            {nav.map((n) => (
              <a key={n.to} href={`#/${n.to}`} className={active(n.to) ? 'on' : ''} aria-label={n.label}>
                <n.icon size={15} style={{ verticalAlign: '-3px' }} /> <span>{n.label.replace('New collection', 'New')}</span>
              </a>
            ))}
          </nav>
        </header>
        {loaded ? page : <div className="page muted">Loading workspace…</div>}
      </div>
      <Toaster />
    </div>
  );
}
