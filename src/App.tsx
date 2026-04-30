import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Edge, Node } from '@xyflow/react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  Globe,
  GripVertical,
  Key,
  LayoutGrid,
  Network,
  Palette,
  Save,
  Server,
  Terminal,
} from 'lucide-react';
import { LandingPage } from './components/LandingPage.tsx';
import { MasterPlan } from './components/MasterPlan';
import { MindMap } from './components/MindMap';
import { PencilStudio } from './components/PencilStudio';
import { Dashboard, type DashboardTab } from './components/Dashboard';
import { AssistantSidebar } from './components/AssistantSidebar';
import { ExecutionRulesViewer } from './components/ExecutionRulesViewer';
import { Logo } from './components/Logo';
import { SourceControlPanel } from './components/SourceControlPanel';
import { readResponseJson } from './lib/apiFetch';

type MainPanel =
  | 'nebula-ui-studio'
  | 'mind-map'
  | 'master-plan'
  | 'project-rules'
  | 'source-control'
  | 'my-projects'
  | 'secrets'
  | 'project-settings'
  | 'dns';

const PANEL_LABEL: Record<MainPanel, string> = {
  'nebula-ui-studio': 'Nebulla UI Studio',
  'mind-map': 'Mind Map',
  'master-plan': 'Master Plan',
  'project-rules': 'Project execution rules (code mode)',
  'source-control': 'Source control',
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

  const [codeMode, setCodeMode] = useState(false);
  const [executionRulesPath, setExecutionRulesPath] = useState('nebula-project/project-execution-rules.md');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    '$ npm run dev',
    'Ready — use the left sidebar to switch views.',
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceInput, setWorkspaceInput] = useState('');
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [workspaceChecked, setWorkspaceChecked] = useState(false);
  const folderFileInputRef = useRef<HTMLInputElement | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const isHostedMode =
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) &&
    !window.location.hostname.endsWith('.local');

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(() => {
    try {
      const raw = localStorage.getItem('nebulla_assistant_width');
      const n = raw ? parseInt(raw, 10) : 340;
      if (Number.isNaN(n)) return 340;
      return Math.min(560, Math.max(260, n));
    } catch {
      return 340;
    }
  });
  const resizeDrag = useRef<{ startX: number; startW: number } | null>(null);
  const assistantWidthRef = useRef(assistantWidth);
  assistantWidthRef.current = assistantWidth;

  useEffect(() => {
    (window as unknown as { openMasterPlan?: () => void }).openMasterPlan = () => {
      setMainPanel('master-plan');
    };
    (window as unknown as { openMasterPlanTab?: (n: number) => void }).openMasterPlanTab = (tabNumber: number) => {
      setMainPanel('master-plan');
      try {
        localStorage.setItem('nebula_master_plan_open_tab', String(tabNumber));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('nebula-open-master-plan-tab', { detail: { tabNumber } }));
    };
    (window as unknown as { openCodingMode?: (relPath?: string) => void }).openCodingMode = (relPath?: string) => {
      setCodeMode(true);
      if (relPath && typeof relPath === 'string' && relPath.trim()) {
        setExecutionRulesPath(relPath.trim());
      } else {
        setExecutionRulesPath('nebula-project/project-execution-rules.md');
      }
      setMainPanel('project-rules');
    };
    return () => {
      const w = window as unknown as {
        openMasterPlan?: () => void;
        openMasterPlanTab?: (n: number) => void;
        openCodingMode?: (p?: string) => void;
      };
      delete w.openMasterPlan;
      delete w.openMasterPlanTab;
      delete w.openCodingMode;
    };
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => setApiConfig(d))
      .catch(() => setApiConfig({}));
  }, []);

  useEffect(() => {
    if (!enteredApp) return;
    let cancelled = false;
    const loadActiveWorkspace = async () => {
      setWorkspaceBusy(true);
      setWorkspaceError(null);
      try {
        const res = await fetch('/api/workspace/active');
        const data = await readResponseJson<{ activePath?: string | null; configuredPath?: string | null; error?: string }>(res);
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (cancelled) return;
        const active = typeof data.activePath === 'string' && data.activePath.trim() ? data.activePath.trim() : null;
        setWorkspacePath(active);
        setWorkspaceInput(active || (typeof data.configuredPath === 'string' ? data.configuredPath : ''));
      } catch (e) {
        if (!cancelled) {
          setWorkspaceError(e instanceof Error ? e.message : 'Failed to load active workspace');
          setWorkspacePath(null);
        }
      } finally {
        if (!cancelled) {
          setWorkspaceBusy(false);
          setWorkspaceChecked(true);
        }
      }
    };
    void loadActiveWorkspace();
    return () => {
      cancelled = true;
    };
  }, [enteredApp]);

  const applyWorkspacePath = useCallback(async () => {
    if (isHostedMode) {
      setWorkspaceError('Local absolute folder paths are only available in local mode (localhost).');
      return false;
    }
    const pathToSet = workspaceInput.trim();
    if (!pathToSet || workspaceBusy) return false;
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    setWorkspaceNotice(null);
    try {
      const res = await fetch('/api/workspace/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathToSet }),
      });
      const data = await readResponseJson<{ activePath?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const active = typeof data.activePath === 'string' ? data.activePath : pathToSet;
      setWorkspacePath(active);
      setWorkspaceInput(active);
      setTerminalOutput((prev) => [...prev, `[workspace] active folder set to ${active}`]);
      window.dispatchEvent(new CustomEvent('nebula-master-plan-updated'));
      return true;
    } catch (e) {
      setWorkspaceError(e instanceof Error ? e.message : 'Could not set workspace path');
      setWorkspacePath(null);
      return false;
    } finally {
      setWorkspaceBusy(false);
      setWorkspaceChecked(true);
    }
  }, [isHostedMode, workspaceBusy, workspaceInput]);

  const pickWorkspaceFolder = useCallback(async () => {
    if (workspaceBusy) return;
    if (isHostedMode) {
      setWorkspaceError('Folder picking cannot map to your computer path in hosted mode. Use localhost for local file writes.');
      return;
    }
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<{ name?: string }> }).showDirectoryPicker;
    if (picker) {
      try {
        setWorkspaceError(null);
        const handle = await picker();
        const selectedName = typeof handle?.name === 'string' && handle.name.trim() ? handle.name.trim() : 'selected folder';
        setWorkspaceNotice(
          `Folder "${selectedName}" selected. Browser security does not expose the full local path here, so paste the absolute path (example: /Users/yourname/Documents/${selectedName}) then click "Set active folder".`,
        );
        return;
      } catch (e) {
        const err = e as DOMException;
        if (err?.name === 'AbortError') return;
      }
    }
    setWorkspaceError(null);
    setWorkspaceNotice(
      'Using browser fallback picker. After choosing a folder, paste its absolute path into the input and click "Set active folder".',
    );
    folderFileInputRef.current?.click();
  }, [isHostedMode, workspaceBusy]);

  const onFolderInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstFile = files[0];
    const relPath =
      typeof (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath === 'string'
        ? (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath || ''
        : '';
    const selectedName = relPath.split('/')[0] || firstFile.name || 'selected folder';
    setWorkspaceNotice(
      `Folder "${selectedName}" selected. Browser security does not expose the full absolute path. Paste the local absolute path, then click "Set active folder".`,
    );
    e.target.value = '';
  }, []);

  const requestWorkspaceAccess = useCallback(
    (next?: () => void) => {
      if (isHostedMode) {
        setWorkspaceNotice('Hosted mode detected. Local folder binding is disabled here; use localhost for local save/commit.');
        next?.();
        return;
      }
      if (workspacePath) {
        next?.();
        return;
      }
      setWorkspaceNotice('Set your local folder first to save, commit, or leave this page.');
      setShowWorkspaceModal(true);
    },
    [isHostedMode, workspacePath],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = resizeDrag.current;
      if (!d) return;
      const delta = d.startX - e.clientX;
      const next = Math.min(560, Math.max(260, d.startW + delta));
      assistantWidthRef.current = next;
      setAssistantWidth(next);
    };
    const onUp = () => {
      if (resizeDrag.current) {
        try {
          localStorage.setItem('nebulla_assistant_width', String(assistantWidthRef.current));
        } catch {
          /* ignore */
        }
      }
      resizeDrag.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
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

  const runTerminalCommand = useCallback(
    async (command: string) => {
      const cmd = command.trim();
      if (!cmd || terminalBusy || !workspacePath) return;
      setTerminalBusy(true);
      setTerminalOutput((prev) => [...prev, `$ ${cmd}`]);
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await readResponseJson<{ output?: string; error?: string }>(res);
        if (!res.ok) {
          setTerminalOutput((prev) => [...prev, data.error || `Command failed (${res.status})`]);
        } else {
          const out = typeof data.output === 'string' ? data.output.trimEnd() : '';
          setTerminalOutput((prev) => [...prev, out || '[ok]']);
        }
      } catch (e) {
        setTerminalOutput((prev) => [...prev, e instanceof Error ? e.message : 'Terminal request failed']);
      } finally {
        setTerminalBusy(false);
      }
    },
    [terminalBusy, workspacePath],
  );

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
      case 'project-rules':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <ExecutionRulesViewer
              filePath={executionRulesPath}
              onExitCodeMode={() => {
                setCodeMode(false);
                setMainPanel('master-plan');
              }}
            />
          </div>
        );
      case 'source-control':
        return (
          <div className="flex-1 min-h-0 h-full p-4 overflow-hidden flex flex-col">
            <SourceControlPanel />
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
            <p className="text-cyan-300 font-headline text-lg leading-tight">nebulla beta</p>
            <p className="text-slate-400 text-xs leading-tight">IDE Workspace</p>
          </div>
        </div>
        <button
          type="button"
            onClick={() => requestWorkspaceAccess(() => setEnteredApp(false))}
          className="text-xs px-3 py-1.5 rounded-md border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
        >
          Back to Landing
        </button>
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden">
        <aside
          className={`relative shrink-0 border-r border-white/10 bg-[#040f1a]/40 flex flex-col items-center py-4 gap-3 transition-[width,opacity] duration-200 overflow-hidden ${
            navCollapsed ? 'w-0 border-transparent opacity-0 pointer-events-none' : 'w-16 opacity-100'
          }`}
        >
          {!navCollapsed ? (
            <>
              <button
                type="button"
                onClick={() => setNavCollapsed(true)}
                className="absolute top-2 right-0 z-10 translate-x-1/2 rounded-full border border-white/15 bg-[#040f1a] p-1 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40"
                title="Collapse navigation"
                aria-label="Collapse navigation"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </button>
              <NavBtn panel="source-control" title="Source control">
                <FolderGit2 className="w-5 h-5" />
              </NavBtn>
              <button
                type="button"
                title="Save / Commit"
                aria-label="Save / Commit"
                onClick={() => requestWorkspaceAccess(() => setMainPanel('source-control'))}
                className={`p-2 rounded-lg transition-colors ${
                  mainPanel === 'source-control' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-cyan-300'
                }`}
              >
                <Save className="w-5 h-5" />
              </button>
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
            </>
          ) : null}
        </aside>
        {navCollapsed ? (
          <button
            type="button"
            onClick={() => setNavCollapsed(false)}
            className="shrink-0 w-7 border-r border-white/10 bg-[#040f1a]/60 flex flex-col items-center justify-center text-slate-500 hover:text-cyan-300 hover:bg-white/5"
            title="Show navigation"
            aria-label="Show navigation"
          >
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        ) : null}

        <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="h-10 shrink-0 border-b border-white/10 bg-white/5 px-4 flex items-center text-sm text-cyan-200">
            {PANEL_LABEL[mainPanel]}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{renderCenter()}</div>

          <div className="h-36 min-h-[6rem] max-h-[45vh] shrink-0 border-t border-white/10 bg-[#040f1a]/60 flex flex-col resize-y overflow-auto">
            <div className="h-8 border-b border-white/10 px-3 flex items-center gap-2 text-xs text-cyan-300">
              <Terminal className="w-4 h-4" />
              Terminal
            </div>
            <div className="flex-1 p-3 font-mono text-xs text-slate-400 overflow-y-auto whitespace-pre-wrap">
              {terminalOutput.map((line, i) => (
                <div key={i} className={line.startsWith('$ ') ? 'text-cyan-400' : ''}>
                  {line}
                </div>
              ))}
            </div>
            <form
              className="h-9 border-t border-white/10 px-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!terminalInput.trim()) return;
                const cmd = terminalInput;
                setTerminalInput('');
                void runTerminalCommand(cmd);
              }}
            >
              <span className="text-cyan-400 font-mono text-xs">$</span>
              <input
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                disabled={terminalBusy || !workspacePath}
                placeholder={terminalBusy ? 'Running…' : workspacePath ? 'Type a command and press Enter' : 'Select workspace first'}
                className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={terminalBusy || !terminalInput.trim()}
                className="text-[10px] px-2 py-1 rounded border border-white/15 text-slate-300 disabled:opacity-40"
              >
                Run
              </button>
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-500 hover:text-slate-300"
                onClick={() => setTerminalOutput([])}
              >
                Clear
              </button>
            </form>
            <div className="h-6 border-t border-white/5 px-3 flex items-center text-[10px] text-slate-500">
              cwd: {workspacePath || 'not set'}
            </div>
          </div>
        </section>

        <button
          type="button"
          aria-label="Resize assistant panel"
          title="Drag to resize chat"
          onMouseDown={(e) => {
            e.preventDefault();
            resizeDrag.current = { startX: e.clientX, startW: assistantWidth };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          className="w-1.5 shrink-0 cursor-col-resize hover:bg-cyan-500/35 bg-white/5 flex items-center justify-center group"
        >
          <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 pointer-events-none" aria-hidden />
        </button>

        <AssistantSidebar
          width={assistantWidth}
          userId="anonymous"
          projectName={projectName}
          codeMode={codeMode}
          onExitCodeMode={() => {
            setCodeMode(false);
            setMainPanel('master-plan');
          }}
        />
      </main>
      {showWorkspaceModal ? (
        <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <section className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#040f1a] p-6 md:p-8 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl text-cyan-200 font-headline">Open your local product folder</h1>
              <button
                type="button"
                onClick={() => setShowWorkspaceModal(false)}
                className="text-xs px-3 py-1.5 rounded-md border border-white/15 text-slate-300 hover:text-white hover:border-white/30"
              >
                Close
              </button>
            </div>
            <p className="text-sm text-slate-300">
              Before generating app code, saving locally, committing, or leaving this page, choose a local folder on your computer.
              Nebulla will create frontend, backend, and database files only inside that folder.
            </p>
            {isHostedMode ? (
              <p className="text-sm text-amber-200/90 border border-amber-500/25 bg-amber-500/10 rounded-lg px-3 py-2">
                Hosted mode detected ({typeof window !== 'undefined' ? window.location.hostname : 'remote host'}). Local absolute paths
                from your computer cannot be resolved by this server. Use localhost for local folder save/commit flows.
              </p>
            ) : null}
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wider text-slate-500">Local folder absolute path</span>
              <input
                value={workspaceInput}
                onChange={(e) => setWorkspaceInput(e.target.value)}
                placeholder="/Users/you/Projects/Accountant"
                className="w-full rounded-lg border border-white/15 bg-[#081425] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/60"
                disabled={workspaceBusy || isHostedMode}
              />
            </label>
            <div className="flex items-center gap-3">
              <input
                ref={folderFileInputRef}
                type="file"
                className="hidden"
                onChange={onFolderInputChange}
                {...{ webkitdirectory: '', directory: '', multiple: true }}
              />
              <button
                type="button"
                onClick={() => void pickWorkspaceFolder()}
                disabled={workspaceBusy || isHostedMode}
                className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-slate-200 text-sm disabled:opacity-40"
              >
                Choose folder
              </button>
              <button
                type="button"
                onClick={() => {
                  void applyWorkspacePath().then((ok) => {
                    if (ok) setShowWorkspaceModal(false);
                  });
                }}
                disabled={workspaceBusy || !workspaceInput.trim() || isHostedMode}
                className="px-4 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-100 text-sm disabled:opacity-40"
              >
                {workspaceBusy ? 'Setting folder…' : 'Set active folder'}
              </button>
              {workspaceChecked && workspaceBusy ? <span className="text-xs text-slate-500">Validating folder…</span> : null}
            </div>
            {workspaceNotice ? <p className="text-sm text-amber-200/90">{workspaceNotice}</p> : null}
            {workspaceError ? <p className="text-sm text-red-300/90">{workspaceError}</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
