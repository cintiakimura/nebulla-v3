import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  BookOpen,
  Globe,
  Key,
  LayoutGrid,
  Network,
  Palette,
  Server,
  Terminal,
} from 'lucide-react';
import { LandingPage } from './components/LandingPage.tsx';
import { MasterPlan } from './components/MasterPlan';
import { MindMap } from './components/MindMap';
import { PencilStudio } from './components/PencilStudio';
import { Dashboard, type DashboardTab } from './components/Dashboard';
import { AssistantSidebar } from './components/AssistantSidebar';
import { Logo } from './components/Logo';

type MainPanel =
  | 'nebula-ui-studio'
  | 'mind-map'
  | 'master-plan'
  | 'my-projects'
  | 'secrets'
  | 'project-settings'
  | 'dns';

const PANEL_LABEL: Record<MainPanel, string> = {
  'nebula-ui-studio': 'Nebulla UI Studio',
  'mind-map': 'Mind Map',
  'master-plan': 'Master Plan',
  'my-projects': 'My Projects',
  secrets: 'Secrets',
  'project-settings': 'Project Settings',
  dns: 'DNS',
};

const seedPages: Node[] = [
  {
    id: '1',
    type: 'pageNode',
    data: {
      label: 'Authentication',
      isCritical: true,
      isCreated: true,
      description: 'Sign-in and session handling.',
    },
    position: { x: 50, y: 220 },
  },
  {
    id: '2',
    type: 'pageNode',
    data: {
      label: 'Dashboard',
      isCritical: true,
      isCreated: false,
      description: 'Main workspace after login.',
    },
    position: { x: 380, y: 220 },
  },
  {
    id: '3',
    type: 'pageNode',
    data: {
      label: 'Settings',
      isCritical: false,
      isCreated: false,
      description: 'Preferences and integrations.',
    },
    position: { x: 710, y: 220 },
  },
];

const seedEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#00ffff' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#00ffff' } },
];

function App() {
  const [enteredApp, setEnteredApp] = useState(false);
  const [mainPanel, setMainPanel] = useState<MainPanel>('master-plan');

  const [pages, setPages] = useState<Node[]>(() => JSON.parse(JSON.stringify(seedPages)) as Node[]);
  const [edges, setEdges] = useState<Edge[]>(() => JSON.parse(JSON.stringify(seedEdges)) as Edge[]);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [projects, setProjects] = useState<{ key: string; name: string; updatedAt: string }[]>([
    { key: 'default', name: 'Untitled Project', updatedAt: new Date().toISOString() },
  ]);
  const [activeProjectKey, setActiveProjectKey] = useState('default');

  const [apiConfig, setApiConfig] = useState<{
    pencilMockupsReady?: boolean;
    nebulaUiStudioDemo?: boolean;
  }>({});

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => setApiConfig(d))
      .catch(() => setApiConfig({}));
  }, []);

  const pagesText = useMemo(() => {
    const sorted = [...pages].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    const lines = sorted.map((p, i) => {
      const d = (p.data || {}) as { label?: string; description?: string };
      const label = typeof d.label === 'string' ? d.label : 'Page';
      const desc = typeof d.description === 'string' ? d.description : '';
      return `${i + 1}. ${label}: ${desc}`;
    });
    return `PAGES & NAVIGATION\n\n${lines.join('\n')}`;
  }, [pages]);

  const handleSaveToMasterPlan = useCallback(() => {
    try {
      localStorage.setItem(
        'nebula_project_default',
        JSON.stringify({ pages, edges, projectName }),
      );
    } catch {
      /* ignore */
    }
  }, [pages, edges, projectName]);

  const onProjectNameChange = (name: string) => {
    setProjectName(name);
    setProjects((prev) =>
      prev.map((p) =>
        p.key === activeProjectKey ? { ...p, name, updatedAt: new Date().toISOString() } : p,
      ),
    );
  };

  const onOpenProject = (key: string) => {
    setActiveProjectKey(key);
    const row = projects.find((p) => p.key === key);
    if (row) setProjectName(row.name);
  };

  const onDeleteProject = (key: string) => {
    if (!window.confirm('Remove this project from the list?')) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.key !== key);
      if (next.length === 0) {
        setActiveProjectKey('default');
        setProjectName('Untitled Project');
        return [{ key: 'default', name: 'Untitled Project', updatedAt: new Date().toISOString() }];
      }
      if (key === activeProjectKey) {
        const first = next[0];
        setActiveProjectKey(first.key);
        setProjectName(first.name);
      }
      return next;
    });
  };

  const onStartFlow = async (_kind: 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload') => {
    /* Flows stay in-dashboard; optional hook for later */
  };

  const dashboardTab: DashboardTab =
    mainPanel === 'my-projects'
      ? 'projects'
      : mainPanel === 'secrets'
        ? 'secrets'
        : mainPanel === 'project-settings'
          ? 'project-settings'
          : mainPanel === 'dns'
            ? 'dns'
            : 'projects';

  const syncDashboardTabToPanel = (tab: DashboardTab) => {
    if (tab === 'projects') setMainPanel('my-projects');
    else if (tab === 'secrets') setMainPanel('secrets');
    else if (tab === 'project-settings') setMainPanel('project-settings');
    else if (tab === 'dns') setMainPanel('dns');
    else if (tab === 'user-settings') setMainPanel('my-projects');
  };

  const renderCenter = () => {
    switch (mainPanel) {
      case 'nebula-ui-studio':
        return (
          <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
            <PencilStudio
              onLock={() => setMainPanel('master-plan')}
              pagesText={pagesText}
              pencilMockupsReady={Boolean(apiConfig.pencilMockupsReady)}
              nebulaUiStudioDemo={Boolean(apiConfig.nebulaUiStudioDemo)}
            />
          </div>
        );
      case 'mind-map':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <MindMap
              pages={pages}
              setPages={setPages}
              edges={edges}
              setEdges={setEdges}
              onSaveToMasterPlan={handleSaveToMasterPlan}
            />
          </div>
        );
      case 'master-plan':
        return (
          <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col">
            <MasterPlan onClose={() => setMainPanel('mind-map')} pagesText={pagesText} />
          </div>
        );
      case 'my-projects':
      case 'secrets':
      case 'project-settings':
      case 'dns':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <Dashboard
              activeTab={dashboardTab}
              onTabChange={syncDashboardTabToPanel}
              projectName={projectName}
              onProjectNameChange={onProjectNameChange}
              projects={projects}
              activeProjectKey={activeProjectKey}
              onOpenProject={onOpenProject}
              onDeleteProject={onDeleteProject}
              onStartFlow={onStartFlow}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const NavBtn = ({
    panel,
    title,
    children,
  }: {
    panel: MainPanel;
    title: string;
    children: ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={mainPanel === panel}
      onClick={() => setMainPanel(panel)}
      className={`p-2 rounded-lg transition-colors ${
        mainPanel === panel ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-cyan-300'
      }`}
    >
      {children}
    </button>
  );

  if (!enteredApp) {
    return <LandingPage onEnter={() => setEnteredApp(true)} />;
  }

  return (
    <div className="h-screen min-h-0 flex flex-col overflow-hidden bg-[#020C17] text-slate-100">
      <header className="h-16 shrink-0 border-b border-white/10 bg-[#040f1a]/70 backdrop-blur flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Logo className="w-9 h-9" />
          <div>
            <p className="text-cyan-300 font-headline text-lg leading-tight">nebulla</p>
            <p className="text-slate-400 text-xs leading-tight">IDE Workspace</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEnteredApp(false)}
          className="text-xs px-3 py-1.5 rounded-md border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
        >
          Back to Landing
        </button>
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden">
        <aside className="w-16 shrink-0 border-r border-white/10 bg-[#040f1a]/40 flex flex-col items-center py-4 gap-3">
          <NavBtn panel="nebula-ui-studio" title="Nebulla UI Studio">
            <Palette className="w-5 h-5" />
          </NavBtn>
          <NavBtn panel="mind-map" title="Mind Map">
            <Network className="w-5 h-5" />
          </NavBtn>
          <NavBtn panel="master-plan" title="Master Plan">
            <BookOpen className="w-5 h-5" />
          </NavBtn>
          <div className="w-8 h-px bg-white/10 my-1" />
          <NavBtn panel="my-projects" title="My Projects">
            <LayoutGrid className="w-5 h-5" />
          </NavBtn>
          <NavBtn panel="secrets" title="Secrets">
            <Key className="w-5 h-5" />
          </NavBtn>
          <NavBtn panel="project-settings" title="Project Settings">
            <Server className="w-5 h-5" />
          </NavBtn>
          <NavBtn panel="dns" title="DNS">
            <Globe className="w-5 h-5" />
          </NavBtn>
        </aside>

        <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="h-10 shrink-0 border-b border-white/10 bg-white/5 px-4 flex items-center text-sm text-cyan-200">
            {PANEL_LABEL[mainPanel]}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{renderCenter()}</div>

          <div className="h-36 shrink-0 border-t border-white/10 bg-[#040f1a]/60 flex flex-col">
            <div className="h-8 border-b border-white/10 px-3 flex items-center gap-2 text-xs text-cyan-300">
              <Terminal className="w-4 h-4" />
              Terminal
            </div>
            <div className="flex-1 p-3 font-mono text-xs text-slate-400 overflow-y-auto">
              <div className="text-cyan-400">$ npm run dev</div>
              <div>Ready — use the left sidebar to switch views. No route changes.</div>
            </div>
          </div>
        </section>

        <AssistantSidebar width={340} userId="anonymous" projectName={projectName} />
      </main>
    </div>
  );
}

export default App;
