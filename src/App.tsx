/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { AssistantSidebar } from './components/AssistantSidebar';
import { MasterPlan } from './components/MasterPlan';
import { MindMap } from './components/MindMap';
import { PencilStudio } from './components/PencilStudio';
import { Dashboard, DashboardTab } from './components/Dashboard';
import { LandingPage } from './components/LandingPage';
import { SimpleLoginModal } from './components/SimpleLoginModal';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { Logo } from './components/Logo';
import {
  listCloudProjects,
  getCloudProject,
  upsertCloudProject,
  deleteCloudProject,
  fetchSessionUser,
  logoutNebula,
} from './lib/nebulaCloud';
import type { NebulaSessionUser } from './lib/nebulaCloud';
import { readResponseJson } from './lib/apiFetch';
import { installNebulaGuardianClient } from './lib/nebulaGuardianClient';
import {
  migrateLegacyGuestProject,
  readGuestIndex,
  readGuestProjectData,
  readActiveGuestProjectId,
  writeGuestProjectData,
  writeActiveGuestProjectId,
  createGuestProject,
  updateGuestIndexMeta,
  removeGuestProject,
} from './lib/nebulaProjectStore';

const ACTIVE_CLOUD_PROJECT_NAME_KEY = 'nebula_active_cloud_project_name';
import { 
  Folder, 
  FileCode, 
  FileJson, 
  FileText, 
  FileType, 
  FileImage, 
  File, 
  Rocket, 
  Download, 
  Search, 
  Palette, 
  Network, 
  BookOpen, 
  LayoutGrid, 
  Server, 
  Key, 
  Settings, 
  ChevronLeft, 
  CloudUpload, 
  Upload, 
  X, 
  ExternalLink, 
  Terminal as TerminalIcon, 
  Eye, 
  History, 
  Bug,
  ChevronDown,
  Save,
  Sparkles,
  Users,
  Edit2,
  Github
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Mock User type since we removed firebase/auth
interface MockUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role?: 'user' | 'admin';
}

function isLocalhostHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );
}

const getFileIconInfo = (filename: string, isDirectory: boolean) => {
  if (isDirectory) return { Icon: Folder, color: 'text-cyan-400' };
  
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return { Icon: FileCode, color: 'text-blue-400' };
    case 'js':
    case 'jsx':
      return { Icon: FileCode, color: 'text-yellow-400' };
    case 'json':
      return { Icon: FileJson, color: 'text-green-400' };
    case 'css':
      return { Icon: FileType, color: 'text-sky-400' };
    case 'html':
      return { Icon: FileType, color: 'text-orange-400' };
    case 'md':
      return { Icon: FileText, color: 'text-slate-300' };
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'ico':
      return { Icon: FileImage, color: 'text-purple-400' };
    default:
      return { Icon: File, color: 'text-slate-500' };
  }
};

const initialPages = [
  { id: '1', type: 'pageNode', data: { label: 'Authentication Portal', isCritical: true, isCreated: true, description: 'GitHub OAuth integration interface.' }, position: { x: 50, y: 250 } },
  { id: '2', type: 'pageNode', data: { label: 'Project Dashboard', isCritical: true, isCreated: false, description: 'Project creation, naming, and auto-provisioning status tracker.' }, position: { x: 350, y: 250 } },
  { id: '3', type: 'pageNode', data: { label: 'Voice-First Workspace', isCritical: true, isCreated: true, description: 'Main IDE interface featuring voice-command visualizer, code editor, and terminal.' }, position: { x: 650, y: 250 } },
  { id: '4', type: 'pageNode', data: { label: 'Settings Panel', isCritical: false, isCreated: false, description: 'Environment variable management, deployment configurations, and integration settings.' }, position: { x: 950, y: 250 } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#00ffff' } },
  { id: 'e2-3', source: '2', target: '3', animated: true, style: { stroke: '#00ffff' } },
  { id: 'e3-4', source: '3', target: '4', animated: true, style: { stroke: '#00ffff' } },
];

/** Fresh mind map + edges (no shared references with other projects or React Flow mutations). */
function deepCloneInitialCanvas() {
  return {
    pages: JSON.parse(JSON.stringify(initialPages)) as typeof initialPages,
    edges: JSON.parse(JSON.stringify(initialEdges)) as typeof initialEdges,
  };
}

export default function App() {
  type NewProjectFlowKind = 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload';
  const [legalRoute, setLegalRoute] = useState<'privacy' | 'terms' | 'reset-password' | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = window.location.pathname;
    if (p === '/privacy') return 'privacy';
    if (p === '/terms') return 'terms';
    if (p === '/reset-password') return 'reset-password';
    return null;
  });

  useEffect(() => {
    const sync = () => {
      const p = window.location.pathname;
      if (p === '/privacy') setLegalRoute('privacy');
      else if (p === '/terms') setLegalRoute('terms');
      else if (p === '/reset-password') setLegalRoute('reset-password');
      else setLegalRoute(null);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const [showLanding, setShowLanding] = useState(() => {
    if (typeof window === 'undefined') return true;
    const p = window.location.pathname;
    if (p === '/privacy' || p === '/terms' || p === '/reset-password') return false;
    return true;
  });

  const [showMasterPlan, setShowMasterPlan] = useState(false);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showPencilStudio, setShowPencilStudio] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab | null>(null);
  
  const [pages, setPages] = useState(initialPages);
  const [edges, setEdges] = useState(initialEdges);
  const [projectName, setProjectName] = useState('Untitled Project');

  const [showSaveSuccessToast, setShowSaveSuccessToast] = useState(false);
  const [sidebarSearchOpen, setSidebarSearchOpen] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');

  type ProjectRowUi = { key: string; name: string; updatedAt: string };
  const [projectListUi, setProjectListUi] = useState<ProjectRowUi[]>([]);
  const [activeGuestProjectId, setActiveGuestProjectId] = useState<string | null>(null);
  const [projectsSource, setProjectsSource] = useState<'guest' | 'cloud'>('guest');

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(160);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'terminal' | null>(null);

  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const [user, setUser] = useState<MockUser | null>(null);
  const isLocalDevAuthEnabled =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    isLocalhostHost(window.location.hostname) &&
    String(process.env.DEV_LOCAL_AUTH || '').toLowerCase() === 'true';
  const localDevUser: MockUser | null = isLocalDevAuthEnabled
    ? {
        uid: process.env.DEV_LOCAL_GITHUB_UID?.trim() || 'github-local-dev',
        displayName: process.env.DEV_LOCAL_GITHUB_NAME?.trim() || 'GitHub Local Dev',
        email: process.env.DEV_LOCAL_GITHUB_EMAIL?.trim() || 'local-dev@github.local',
        photoURL:
          process.env.DEV_LOCAL_GITHUB_AVATAR?.trim() ||
          'https://avatars.githubusercontent.com/u/9919?v=4',
        role: 'user',
      }
    : null;
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingProjectFlow, setPendingProjectFlow] = useState<NewProjectFlowKind | null>(null);
  const [sessionReloadNonce, setSessionReloadNonce] = useState(0);

  const [deviceUserId] = useState(() => {
    if (typeof window === 'undefined') return 'anonymous';
    try {
      let id = localStorage.getItem('nebulla_device_user_id');
      if (!id) {
        id =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        localStorage.setItem('nebulla_device_user_id', id);
      }
      return id;
    } catch {
      return `anon_${Date.now()}`;
    }
  });
  const conversationUserId = user?.uid ?? deviceUserId;
  const [files, setFiles] = useState<{name: string, isDirectory: boolean}[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [currentPath, setCurrentPath] = useState<string>('.');

  const getFileContent = async (filename: string) => {
    try {
      const fullPath = currentPath === '.' ? filename : `${currentPath}/${filename}`;
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(fullPath)}`);
      if (res.ok) {
        const data = await res.json();
        setFileContent(data.content);
      } else {
        setFileContent(`// Error loading ${filename}`);
      }
    } catch (err) {
      setFileContent(`// Error loading ${filename}`);
    }
  };

  const handleFileClick = (filename: string, isDirectory: boolean) => {
    if (isDirectory) {
      const newPath = currentPath === '.' ? filename : `${currentPath}/${filename}`;
      setCurrentPath(newPath);
      return;
    }
    setSelectedFile(filename);
    getFileContent(filename);
    setShowCodePreview(true);
    setShowPencilStudio(false);
    setShowMasterPlan(false);
    setShowMindMap(false);
    setDashboardTab(null);
  };

  /** While Nebula UI Studio runs generation, surface the prompt manifest in the editor. */
  const openNebulaUiStudioMarkdownForStudio = () => {
    setCurrentPath('.');
    setSelectedFile('nebula-sysh-ui-sysh-studio.md');
    setShowCodePreview(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/files/content?path=${encodeURIComponent('nebula-sysh-ui-sysh-studio.md')}`
        );
        if (res.ok) {
          const data = await res.json();
          setFileContent(data.content);
        } else {
          setFileContent('// Could not load nebula-sysh-ui-sysh-studio.md');
        }
      } catch {
        setFileContent('// Could not load nebula-sysh-ui-sysh-studio.md');
      }
    })();
  };

  const handleGoBack = () => {
    if (currentPath === '.') return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.length === 0 ? '.' : parts.join('/'));
  };
  const [terminalHistory, setTerminalHistory] = useState<{command: string, output: string}[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  /** Clear file tree selection, editor buffer, terminal — repo files are shared, but UI must not show the previous project's context. */
  const resetIdeStateForProjectChange = () => {
    setSelectedFile(null);
    setFileContent('');
    setCurrentPath('.');
    setShowCodePreview(false);
    setFileSearchQuery('');
    setSidebarSearchOpen(false);
    setTerminalHistory([]);
    setTerminalInput('');
  };

  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(async (res) => readResponseJson(res))
      .then(data => setConfig(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    installNebulaGuardianClient();
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalHistory]);

  const hydrateGuestWorkspace = () => {
    const { pages: seedPages, edges: seedEdges } = deepCloneInitialCanvas();
    const { index, activeId } = migrateLegacyGuestProject('Untitled Project', {
      pages: seedPages,
      edges: seedEdges,
      projectName: 'Untitled Project',
    });
    setActiveGuestProjectId(activeId);
    setProjectsSource('guest');
    setProjectListUi(index.map((e) => ({ key: e.id, name: e.name, updatedAt: e.updatedAt })));
    const d = readGuestProjectData(activeId);
    if (d?.pages) setPages(d.pages as typeof initialPages);
    if (d?.edges) setEdges(d.edges as typeof initialEdges);
    if (d?.projectName) setProjectName(d.projectName);
  };

  useEffect(() => {
    if (localDevUser) {
      setUser(localDevUser);
      hydrateGuestWorkspace();
      return;
    }

    if (config === null) {
      hydrateGuestWorkspace();
      return;
    }

    if (!config.cloudStorageReady) {
      hydrateGuestWorkspace();
      return;
    }

    const mapNebulaUser = (u: NebulaSessionUser | null): MockUser | null =>
      u
        ? {
            uid: u.uid,
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            role: u.role ?? 'user',
          }
        : null;

    const loadCloudOrGuest = async () => {
      const sessionUser = await fetchSessionUser();
      const mapped = mapNebulaUser(sessionUser);
      setUser(mapped);

      if (!mapped) {
        hydrateGuestWorkspace();
        return;
      }

      const rows = await listCloudProjects();
      if (!rows.length) {
        hydrateGuestWorkspace();
        return;
      }

      setProjectsSource('cloud');
      setProjectListUi(
        rows.map((r) => ({ key: r.name, name: r.name, updatedAt: r.updated_at || new Date().toISOString() }))
      );
      const activeName = localStorage.getItem(ACTIVE_CLOUD_PROJECT_NAME_KEY);
      const preferred = activeName ? rows.find((r) => r.name === activeName) : undefined;
      const pick = preferred ?? rows[0];
      if (pick.pages) setPages(pick.pages as typeof initialPages);
      if (pick.edges) setEdges(pick.edges as typeof initialEdges);
      if (pick.name) setProjectName(pick.name);
      localStorage.setItem(
        'nebula_project_default',
        JSON.stringify({
          pages: pick.pages ?? [],
          edges: pick.edges ?? [],
          projectName: pick.name,
        })
      );
    };

    void loadCloudOrGuest();
  }, [localDevUser, config, sessionReloadNonce]);

  useEffect(() => {
    fetch(`/api/fs/list?path=${encodeURIComponent(currentPath)}`)
      .then(res => res.json())
      .then(data => {
        if (data.files) setFiles(data.files);
      })
      .catch(console.error);
  }, [currentPath]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      if (isResizing === 'left') {
        setLeftWidth(Math.max(150, Math.min(e.clientX - 64, 600)));
      } else if (isResizing === 'right') {
        setRightWidth(Math.max(200, Math.min(window.innerWidth - e.clientX, 800)));
      } else if (isResizing === 'terminal') {
        setTerminalHeight(Math.max(100, Math.min(window.innerHeight - e.clientY - 40, 600)));
      }
    };
    const handleMouseUp = () => setIsResizing(null);
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Generate dynamic text for Master Plan
  const pagesText = useMemo(() => {
    const sortedPages = [...pages].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    const lines = sortedPages.map((p, i) => {
      const d = (p.data || {}) as { label?: string; description?: string };
      const label = typeof d.label === 'string' ? d.label : 'Page';
      const desc = typeof d.description === 'string' ? d.description : '';
      return `${i + 1}. ${label}: ${desc}`;
    });
    return `PAGES & NAVIGATION\n\nRULE: Pages and Navigation must stay automatically synchronized with the Mind Map. Any change in Pages & Navigation should update the Mind Map, and any change in the Mind Map should update Pages & Navigation.\n\n${lines.join('\n')}`;
  }, [pages]);

  useEffect(() => {
    if (!showSaveSuccessToast) return;
    const t = window.setTimeout(() => setShowSaveSuccessToast(false), 2800);
    return () => window.clearTimeout(t);
  }, [showSaveSuccessToast]);

  const showProjectSavedToast = () => setShowSaveSuccessToast(true);

  const handleSaveToMasterPlan = async () => {
    const projectData = { pages, edges, projectName };
    localStorage.setItem('nebula_project_default', JSON.stringify(projectData));

    const useGuestStore = localDevUser || !user || projectsSource === 'guest';

    if (useGuestStore) {
      let gid = activeGuestProjectId || readActiveGuestProjectId();
      if (!gid) {
        const { index, activeId } = migrateLegacyGuestProject('Untitled Project', {
          pages,
          edges,
          projectName,
        });
        gid = activeId;
        setActiveGuestProjectId(gid);
        setProjectListUi(index.map((e) => ({ key: e.id, name: e.name, updatedAt: e.updatedAt })));
      }
      writeGuestProjectData(gid, projectData);
      updateGuestIndexMeta(gid, projectName);
      writeActiveGuestProjectId(gid);
      setProjectListUi(readGuestIndex().map((e) => ({ key: e.id, name: e.name, updatedAt: e.updatedAt })));
      showProjectSavedToast();
      return;
    }

    if (!user) {
      showProjectSavedToast();
      return;
    }

    const ok = await upsertCloudProject({ name: projectName, pages, edges });

    if (!ok) {
      console.error('Error saving project to Render PostgreSQL');
      alert('Failed to save project to cloud. A copy is still in this browser.');
    } else {
      localStorage.setItem(ACTIVE_CLOUD_PROJECT_NAME_KEY, projectName);
      const rows = await listCloudProjects();
      if (rows.length) {
        setProjectListUi(
          rows.map((r) => ({ key: r.name, name: r.name, updatedAt: r.updated_at || new Date().toISOString() }))
        );
      }
    }

    showProjectSavedToast();
  };

  const createBlankProjectWorkspace = async (requestedName?: string) => {
    const normalized = typeof requestedName === 'string' ? requestedName.trim() : '';
    const newName =
      normalized || `Untitled ${new Date().toLocaleDateString()} · ${Math.random().toString(36).slice(2, 6)}`;
    const { pages: blankPages, edges: blankEdges } = deepCloneInitialCanvas();

    if (localDevUser || !user || projectsSource === 'guest') {
      const entry = createGuestProject({
        pages: blankPages,
        edges: blankEdges,
        projectName: newName,
      });
      setActiveGuestProjectId(entry.id);
      setPages(blankPages);
      setEdges(blankEdges);
      setProjectName(newName);
      setProjectsSource('guest');
      setProjectListUi(readGuestIndex().map((e) => ({ key: e.id, name: e.name, updatedAt: e.updatedAt })));
      localStorage.setItem(
        'nebula_project_default',
        JSON.stringify({ pages: blankPages, edges: blankEdges, projectName: newName })
      );
      resetIdeStateForProjectChange();
      setDashboardTab(null);
      setShowMasterPlan(false);
      setShowMindMap(false);
      setShowPencilStudio(false);
      showProjectSavedToast();
      return;
    }

    if (!user) return;

    const created = await upsertCloudProject({ name: newName, pages: blankPages, edges: blankEdges });
    if (!created) {
      console.error('Cloud project create failed');
      alert('Could not create a new cloud project. Check DATABASE_URL and session, then try again.');
      return;
    }
    localStorage.setItem(ACTIVE_CLOUD_PROJECT_NAME_KEY, newName);
    const rows = await listCloudProjects();
    if (rows.length) {
      setProjectListUi(
        rows.map((r) => ({ key: r.name, name: r.name, updatedAt: r.updated_at || new Date().toISOString() }))
      );
    }
    setPages(blankPages);
    setEdges(blankEdges);
    setProjectName(newName);
    localStorage.setItem(
      'nebula_project_default',
      JSON.stringify({ pages: blankPages, edges: blankEdges, projectName: newName })
    );
    resetIdeStateForProjectChange();
    setDashboardTab(null);
    setShowMasterPlan(false);
    setShowMindMap(false);
    setShowPencilStudio(false);
    showProjectSavedToast();
  };

  const openProjectByKey = async (key: string) => {
    if (projectsSource === 'guest' || localDevUser || !user) {
      let gid = activeGuestProjectId || readActiveGuestProjectId();
      if (gid && gid !== key) {
        writeGuestProjectData(gid, { pages, edges, projectName });
        updateGuestIndexMeta(gid, projectName);
      }
      const d = readGuestProjectData(key);
      if (!d?.pages) return;
      setActiveGuestProjectId(key);
      writeActiveGuestProjectId(key);
      setPages(d.pages as typeof initialPages);
      setEdges(d.edges as typeof initialEdges);
      setProjectName(d.projectName);
      localStorage.setItem('nebula_project_default', JSON.stringify(d));
      resetIdeStateForProjectChange();
      setDashboardTab(null);
      return;
    }

    if (!user) return;

    await upsertCloudProject({ name: projectName, pages, edges });

    localStorage.setItem(ACTIVE_CLOUD_PROJECT_NAME_KEY, key);
    const row = await getCloudProject(key);

    if (row?.pages) setPages(row.pages as typeof initialPages);
    if (row?.edges) setEdges(row.edges as typeof initialEdges);
    if (row?.name) setProjectName(row.name);
    localStorage.setItem(
      'nebula_project_default',
      JSON.stringify({ pages: row?.pages ?? pages, edges: row?.edges ?? edges, projectName: row?.name ?? projectName })
    );
    resetIdeStateForProjectChange();
    setDashboardTab(null);
  };

  const deleteProjectByKey = (key: string) => {
    if (!window.confirm('Delete this project from this browser? This cannot be undone.')) return;
    if (projectsSource === 'guest' || localDevUser || !user) {
      const next = removeGuestProject(key);
      setProjectListUi(next.map((e) => ({ key: e.id, name: e.name, updatedAt: e.updatedAt })));
      const fallback = next[0];
      if (fallback) {
        const d = readGuestProjectData(fallback.id);
        if (d?.pages) {
          setActiveGuestProjectId(fallback.id);
          setPages(d.pages as typeof initialPages);
          setEdges(d.edges as typeof initialEdges);
          setProjectName(d.projectName);
        }
      } else {
        void createBlankProjectWorkspace();
      }
      return;
    }
    void (async () => {
      if (!user) return;
      await deleteCloudProject(key);
      const rows = await listCloudProjects();
      if (rows.length) {
        setProjectListUi(
          rows.map((r) => ({ key: r.name, name: r.name, updatedAt: r.updated_at || new Date().toISOString() }))
        );
        const r0 = rows[0];
        localStorage.setItem(ACTIVE_CLOUD_PROJECT_NAME_KEY, r0.name);
        if (r0.pages) setPages(r0.pages as typeof initialPages);
        if (r0.edges) setEdges(r0.edges as typeof initialEdges);
        setProjectName(r0.name);
      } else {
        hydrateGuestWorkspace();
      }
    })();
  };

  const startNewProjectFlow = async (kind: NewProjectFlowKind) => {
    if (!localDevUser && !user) {
      setPendingProjectFlow(kind);
      setShowLoginModal(true);
      return;
    }
    const inputName = window.prompt('What is the name of your project?');
    const projectNameInput = (inputName || '').trim();
    if (!projectNameInput) return;

    await createBlankProjectWorkspace(projectNameInput);
    if ((window as any).openMasterPlan) {
      (window as any).openMasterPlan();
    }
    const send = (text: string) => {
      if ((window as any).nebula_handleSendText) {
        (window as any).nebula_handleSendText(text);
      }
    };
    if (kind === 'quick') {
      send(
        "Quick generate: fully automatic mode. Ask me only this one question and nothing else: Hey. Tell me about the app you want to build. What are you trying to solve? Why are you passionate about it? What's the main thing it needs to do? Do you have a logo or domain already? Who's going to use it and what roles do they have? Any thoughts on security or permissions? The more you tell me, the better I can help you build it. After I answer, automatically run the full project workflow and start building without asking for confirmation."
      );
      return;
    }
    if (kind === 'devpartner') {
      send(
        'Dev partner mode: I want to participate and approve every section of project development step by step. Start with Tab 1 (Goal of the app), ask your discovery questions, and wait for my explicit approval before moving to the next tab.'
      );
      return;
    }
    if (kind === 'prompt') {
      const prompt = window.prompt('Paste your written prompt:');
      if (prompt) {
        send(prompt);
      }
      return;
    }
    if (kind === 'github') {
      const repo = window.prompt('Paste GitHub repository link:');
      if (repo) {
        send(`I want to clone and analyze this GitHub repository: ${repo}`);
      }
      return;
    }
    if (kind === 'upload') {
      send(
        'Upload files: I am starting from my own project files. Please tell me exactly what to upload (formats, structure) and how you will use them to build the app.'
      );
    }
  };

  useEffect(() => {
    if (!pendingProjectFlow) return;
    if (!user && !localDevUser) return;
    const pending = pendingProjectFlow;
    setPendingProjectFlow(null);
    void startNewProjectFlow(pending);
  }, [pendingProjectFlow, user, localDevUser]);

  const handleLogout = async () => {
    await logoutNebula();
    setUser(null);
    setProjectsSource('guest');
    hydrateGuestWorkspace();
  };

  const appendTerminalLog = (command: string, output: string) => {
    setTerminalHistory((prev) => [...prev, { command, output }]);
  };

  const deployOnRender = async () => {
    setIsTerminalOpen(true);
    appendTerminalLog('render deploy', 'Starting deployment on Render...');
    try {
      const deployRes = await fetch('/api/render/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const deployData = await readResponseJson<{
        ok?: boolean;
        mode?: string;
        serviceId?: string;
        deployId?: string;
        status?: string;
        error?: string;
      }>(deployRes);
      if (!deployRes.ok || deployData?.error) {
        appendTerminalLog('render deploy', `ERROR: ${deployData?.error || 'Failed to trigger deployment.'}`);
        return;
      }

      appendTerminalLog(
        'render deploy',
        `Deployment triggered (${deployData.mode || 'render'}). Initial status: ${deployData.status || 'unknown'}.`
      );

      if (deployData.mode === 'deploy-hook' || !deployData.deployId) {
        appendTerminalLog(
          'render status',
          'Deploy hook triggered. No deploy id available for polling. Check Render dashboard for final status.'
        );
        return;
      }

      const terminalStatuses = new Set<string>();
      for (let i = 0; i < 90; i++) {
        await new Promise((resolve) => window.setTimeout(resolve, 4000));
        const statusRes = await fetch(
          `/api/render/deploy/status?deployId=${encodeURIComponent(deployData.deployId)}`
        );
        const statusData = await readResponseJson<{
          status?: string;
          message?: string;
          error?: string;
        }>(statusRes);
        if (!statusRes.ok || statusData?.error) {
          appendTerminalLog('render status', `ERROR: ${statusData?.error || 'Could not read deploy status.'}`);
          return;
        }

        const normalized = String(statusData.status || 'unknown').toLowerCase();
        const withMessage = statusData.message ? ` — ${statusData.message}` : '';
        if (!terminalStatuses.has(`${normalized}${withMessage}`)) {
          terminalStatuses.add(`${normalized}${withMessage}`);
          appendTerminalLog('render status', `${normalized}${withMessage}`);
        }

        if (['live', 'deployed', 'active', 'healthy', 'ready', 'success', 'succeeded'].includes(normalized)) {
          appendTerminalLog('render deploy', 'Deployment succeeded. Refreshing page...');
          window.setTimeout(() => window.location.reload(), 1200);
          return;
        }
        if (['build_failed', 'failed', 'error', 'canceled', 'cancelled'].includes(normalized)) {
          appendTerminalLog('render deploy', `ERROR: Deployment failed with status "${normalized}".`);
          return;
        }
      }
      appendTerminalLog(
        'render deploy',
        'Status polling timed out. Deployment may still be running. Check Render dashboard.'
      );
    } catch (err: any) {
      appendTerminalLog('render deploy', `ERROR: ${err?.message || 'Unknown deploy error.'}`);
    }
  };

  const handleAction = (actionName: string) => {
    if (actionName === 'Upload' || actionName === 'Deploy') {
      void deployOnRender();
      return;
    }
    console.log(`${actionName} initiated.`);
  };

  useEffect(() => {
    (window as any).openMasterPlanTab = (tabNumber: number) => {
      try {
        localStorage.setItem('nebula_master_plan_open_tab', String(tabNumber));
      } catch {
        /* ignore */
      }
      setShowMasterPlan(true);
      setShowMindMap(false);
      setShowPencilStudio(false);
      setDashboardTab(null);
      setShowCodePreview(false);
      window.dispatchEvent(new CustomEvent('nebula-open-master-plan-tab', { detail: { tabNumber } }));
    };

    (window as any).openMasterPlan = () => {
      setShowMasterPlan(true);
      setShowMindMap(false);
      setShowPencilStudio(false);
      setDashboardTab(null);
      setShowCodePreview(false);
    };

    (window as any).openMindMap = () => {
      setShowMindMap(true);
      setShowMasterPlan(false);
      setShowPencilStudio(false);
      setDashboardTab(null);
      setShowCodePreview(false);
    };

    (window as any).openUIUX = () => {
      setShowPencilStudio(true);
      setShowMindMap(false);
      setShowMasterPlan(false);
      setDashboardTab(null);
      setShowCodePreview(false);
    };

    (window as any).openPreview = () => {
      setShowCodePreview(false);
      setShowPencilStudio(false);
      setShowMindMap(false);
      setShowMasterPlan(false);
      setDashboardTab(null);
    };

    (window as any).syncMindMapFromMasterPlan = async () => {
      try {
        const res = await fetch('/api/master-plan/read');
        if (!res.ok) return;
        const plan = await readResponseJson<Record<string, string>>(res);
        const sectionPages = plan["4. Pages and navigation"];
        
        if (!sectionPages) return;

        // Flexible parser for Section 7
        // Handles "1. Page", "- Page", "* Page", or just "Page"
        const lines = sectionPages.split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0 && !l.startsWith('#')); // Skip empty lines and headers
        
        if (lines.length === 0) return;

        const newPages = lines.map((line: string, index: number) => {
          // Clean up list markers: "1. ", "- ", "* ", "1) "
          const cleanLine = line.replace(/^(\d+[\.\)]|[-*])\s*/, '').trim();
          const [label, ...descParts] = cleanLine.split(':');
          const description = descParts.join(':').trim();
          
          return {
            id: String(index + 1),
            type: 'pageNode',
            data: { 
              label: label.trim(), 
              isCritical: index < 3, 
              isCreated: false, 
              description: description || 'Generated from Master Plan' 
            },
            position: { x: 50 + (index * 300), y: 250 }
          };
        });

        const newEdges = newPages.slice(0, -1).map((page: any, index: number) => ({
          id: `e${page.id}-${newPages[index + 1].id}`,
          source: page.id,
          target: newPages[index + 1].id,
          animated: true,
          style: { stroke: '#00ffff' }
        }));

        setPages(newPages);
        setEdges(newEdges);
        
        // Persist to local storage as well
        localStorage.setItem('nebula_project_default', JSON.stringify({ pages: newPages, edges: newEdges }));
        console.log("Mind Map synchronized from Master Plan Section 7");
      } catch (err) {
        console.error("Failed to sync Mind Map from Master Plan:", err);
      }
    };

    return () => {
      delete (window as any).openMasterPlanTab;
      delete (window as any).openMasterPlan;
      delete (window as any).openMindMap;
      delete (window as any).openUIUX;
      delete (window as any).openPreview;
      delete (window as any).syncMindMapFromMasterPlan;
    };
  }, []);

  useEffect(() => {
    (window as any).startUIUXWorkflow = () => {
      console.log("Starting UI/UX Workflow...");
      setShowPencilStudio(true);
      setShowMindMap(false);
      setShowMasterPlan(false);
      setDashboardTab(null);
    };

    return () => {
      delete (window as any).startUIUXWorkflow;
    };
  }, []);

  const handleLockDesign = () => {
    setShowPencilStudio(false);
    setShowMasterPlan(true);
    setShowMindMap(false);
    setDashboardTab(null);
    setShowCodePreview(false);
  };

  const handleTerminalSubmit = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && terminalInput.trim()) {
      const command = terminalInput.trim();
      setTerminalInput('');
      setTerminalHistory(prev => [...prev, { command, output: 'Executing...' }]);
      
      try {
        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command })
        });
        const data = await res.json();
        setTerminalHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].output = data.output;
          return newHistory;
        });
      } catch (err: any) {
        setTerminalHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1].output = err.message;
          return newHistory;
        });
      }
    }
  };

  if (legalRoute === 'privacy') {
    return <PrivacyPolicyPage />;
  }
  if (legalRoute === 'terms') {
    return <TermsOfServicePage />;
  }
  if (legalRoute === 'reset-password') {
    return <ResetPasswordPage />;
  }

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden">
      {/* TopAppBar */}
      <header className="h-16 w-full z-50 flex justify-between items-center px-8 bg-[#040f1a]/60 backdrop-blur-xl border-b border-white/5 shadow-[0_0_20px_rgba(96,0,159,0.05)]">
        <div className="flex items-center gap-4">
          <Logo className="w-12 h-12" />
          <h1 className="font-headline text-4xl font-light tracking-tighter text-cyan-300 no-bold">nebulla</h1>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <div
                className="text-xs px-3 py-1 rounded-lg border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 font-headline max-w-[220px] truncate"
                title={user.email || user.displayName || ''}
              >
                {user.email || user.displayName || 'Signed in'}
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="text-xs px-3 py-1 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 font-headline transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="text-xs px-3 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/15 font-headline transition-colors"
            >
              Login
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Resizing Overlay */}
        {isResizing && (
          <div 
            className="fixed inset-0 z-[9999]" 
            style={{ cursor: isResizing === 'terminal' ? 'row-resize' : 'col-resize' }} 
          />
        )}

        {/* 1. Left Sidebar (Icon Menu) */}
        <aside className="flex flex-col items-center py-4 gap-6 border-r border-white/5 bg-[#040f1a]/20 w-16 shrink-0">
          <button 
            onClick={() => setIsLeftOpen(!isLeftOpen)}
            className={`transition-all ${isLeftOpen ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Toggle File Tree"
          >
            <Folder className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSidebarSearchOpen(true);
              setIsLeftOpen(true);
            }}
            className={`transition-all ${sidebarSearchOpen ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Search files"
          >
            <Search className="w-5 h-5" />
          </button>
          
          <div className="w-8 h-[1px] bg-white/10 my-1"></div>
          <button 
            onClick={() => { setShowPencilStudio(true); setShowMindMap(false); setShowMasterPlan(false); setDashboardTab(null); }}
            className={`transition-all ${showPencilStudio ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Nebulla UI Studio"
          >
            <Palette className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setShowMindMap(true); setShowMasterPlan(false); setShowPencilStudio(false); setDashboardTab(null); }}
            className={`transition-all ${showMindMap ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Mind Map"
          >
            <Network className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setShowMasterPlan(true); setShowMindMap(false); setShowPencilStudio(false); setDashboardTab(null); }}
            className={`transition-all ${showMasterPlan ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]' : 'text-slate-500 hover:text-yellow-400 hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]'}`}
            title="Master Plan"
          >
            <BookOpen className="w-5 h-5" />
          </button>
          
          <button 
            onClick={handleSaveToMasterPlan}
            className="text-slate-500 hover:text-green-400 transition-all"
            title="Save Project"
          >
            <Save className="w-5 h-5" />
          </button>

          <div className="w-8 h-[1px] bg-white/10 my-1"></div>
          
          <button 
            onClick={() => { setDashboardTab('projects'); setShowPencilStudio(false); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`transition-all ${dashboardTab === 'projects' ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="User Projects"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          <button 
            onClick={() => { setDashboardTab('project-settings'); setShowPencilStudio(false); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`transition-all ${dashboardTab === 'project-settings' ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Project Settings"
          >
            <Server className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setDashboardTab('secrets'); setShowPencilStudio(false); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`transition-all ${dashboardTab === 'secrets' ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Secrets and Integrations"
          >
            <Key className="w-5 h-5" />
          </button>

          <div className="mt-auto flex flex-col gap-6 mb-4">
            <button 
              onClick={() => { setDashboardTab('user-settings'); setShowPencilStudio(false); setShowMindMap(false); setShowMasterPlan(false); }}
              className={`transition-all ${dashboardTab === 'user-settings' ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
              title="User Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </aside>

        {/* 2. Navigation Pane (File Tree) */}
        {isLeftOpen && (
          <>
            <aside className="flex flex-col min-h-0 border-r border-white/5 bg-[#040f1a]/30 shrink-0" style={{ width: leftWidth }}>
              <div className="p-4 border-b border-white/5 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {currentPath !== '.' && (
                    <button onClick={handleGoBack} className="text-slate-500 hover:text-cyan-300 transition-colors">
                      <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    </button>
                  )}
                  <span className="text-cyan-300 font-light tracking-widest text-xs font-headline no-bold uppercase">
                    {currentPath === '.' ? 'Source Control' : currentPath.split('/').pop()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      fetch(`/api/fs/list?path=${encodeURIComponent(currentPath)}`)
                        .then(res => res.json())
                        .then(data => {
                          if (data.files) setFiles(data.files);
                        })
                        .catch(console.error);
                    }}
                    className="text-slate-500 hover:text-cyan-300 transition-colors"
                    title="Refresh"
                  >
                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                  </button>
                  <button 
                    onClick={() => setIsLeftOpen(false)}
                    className="text-slate-500 hover:text-cyan-300 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
                </div>
                {(sidebarSearchOpen || fileSearchQuery.trim()) && (
                  <div className="flex items-center gap-2">
                    <input
                      type="search"
                      autoFocus
                      placeholder="Filter files…"
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                      className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1.5 text-13 text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-500/40"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFileSearchQuery('');
                        setSidebarSearchOpen(false);
                      }}
                      className="text-slate-500 hover:text-slate-300 text-xs font-headline shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <nav className="flex-1 py-2 flex flex-col px-1 overflow-y-auto font-mono text-13 min-h-0">
                {files
                  .filter(
                    (file) =>
                      !fileSearchQuery.trim() ||
                      file.name.toLowerCase().includes(fileSearchQuery.trim().toLowerCase())
                  )
                  .map((file, i) => {
                  const { Icon, color } = getFileIconInfo(file.name, file.isDirectory);
                  const isSelected = selectedFile === file.name;
                  return (
                    <div 
                      key={i} 
                      onClick={() => handleFileClick(file.name, file.isDirectory)}
                      className={`flex items-center gap-1.5 px-2 h-[22px] transition-all cursor-pointer ${file.isDirectory ? 'font-bold text-slate-400' : 'ml-4'} ${isSelected ? 'text-cyan-300 bg-cyan-500/10' : 'text-slate-400 hover:text-cyan-200 hover:bg-white/5'}`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <span className="no-bold text-[13px] leading-none truncate">{file.name}</span>
                    </div>
                  );
                })}
              </nav>

              {/* Quick Actions */}
              <div className="p-4 border-t border-white/5 space-y-3">
                <div className="flex flex-col gap-1 group relative">
                  <span className="text-[10px] text-slate-500 font-headline uppercase tracking-tighter no-bold">Active Project</span>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      onBlur={handleSaveToMasterPlan}
                      className="bg-transparent border-none text-13 text-slate-200 font-headline focus:ring-1 focus:ring-cyan-500/50 rounded px-1 -ml-1 w-full outline-none"
                      placeholder="Project Name"
                    />
                    <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-headline uppercase tracking-tighter no-bold block pt-2">Quick Actions</span>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => handleAction('Connect')}
                    className="flex items-center gap-2 text-13 text-slate-400 hover:text-cyan-300 transition-all no-bold"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    Sync Git
                  </button>
                  <button 
                    onClick={() => handleAction('Upload')}
                    className="flex items-center gap-2 text-13 text-slate-400 hover:text-cyan-300 transition-all no-bold"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Deploy on Render
                  </button>
                </div>
              </div>
            </aside>

            {/* Left Splitter */}
            <div 
              className="w-1 cursor-col-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0" 
              onMouseDown={() => setIsResizing('left')} 
            />
          </>
        )}

        {/* 3. Central Preview Area (Tabs + Editor) */}
        <section className="flex flex-col overflow-hidden flex-1 min-h-0">
          {/* Tabs */}
          <div className="h-10 border-b border-white/5 bg-white/5 flex items-center px-2">
            <div className="flex items-center gap-2 px-4 py-1.5 bg-background border-t border-x border-white/5 rounded-t-lg text-13 text-cyan-300">
              {dashboardTab ? (
                <>
                  {dashboardTab === 'projects' ? <LayoutGrid className="w-3.5 h-3.5" /> :
                   dashboardTab === 'project-settings' ? <Server className="w-3.5 h-3.5" /> :
                   dashboardTab === 'secrets' ? <Key className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
                  <span className="no-bold">
                    {dashboardTab === 'projects' ? 'User Projects' :
                     dashboardTab === 'project-settings' ? 'Project Settings' :
                     dashboardTab === 'secrets' ? 'Secrets and Integrations' : 'User Settings'}
                  </span>
                </>
              ) : showPencilStudio ? (
                <>
                  <Palette className="w-3.5 h-3.5" />
                  <span className="no-bold">Nebulla UI Studio</span>
                </>
              ) : showMasterPlan ? (
                <>
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="no-bold">Master Plan</span>
                </>
              ) : showMindMap ? (
                <>
                  <Network className="w-3.5 h-3.5" />
                  <span className="no-bold">Mind Map</span>
                </>
              ) : (
                <>
                  <FileCode className="w-3.5 h-3.5" />
                  <span className="no-bold">{selectedFile || 'index.tsx'}</span>
                </>
              )}
              <X className="w-3.5 h-3.5 hover:text-red-400 cursor-pointer" onClick={() => {
                setDashboardTab(null);
                setShowPencilStudio(false);
                setShowMasterPlan(false);
                setShowMindMap(false);
              }} />
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 p-6 overflow-y-auto bg-black/20 relative flex flex-col min-h-0">
            <div className="flex-1 flex flex-col gap-6 min-h-0">
              {dashboardTab ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <Dashboard 
                    activeTab={dashboardTab} 
                    onTabChange={setDashboardTab} 
                    projectName={projectName}
                    onProjectNameChange={(name) => {
                      setProjectName(name);
                      localStorage.setItem('nebula_project_default', JSON.stringify({ pages, edges, projectName: name }));
                    }}
                    projects={projectListUi}
                    activeProjectKey={
                      projectsSource === 'guest'
                        ? activeGuestProjectId || ''
                        : projectName
                    }
                    onOpenProject={(key) => void openProjectByKey(key)}
                    onDeleteProject={deleteProjectByKey}
                    onStartFlow={startNewProjectFlow}
                  />
                </div>
              ) : showPencilStudio ? (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <PencilStudio
                    onLock={handleLockDesign}
                    pagesText={pagesText}
                    onBeforeGenerate={openNebulaUiStudioMarkdownForStudio}
                    pencilMockupsReady={Boolean(config?.pencilMockupsReady)}
                    nebulaUiStudioDemo={Boolean(config?.nebulaUiStudioDemo)}
                  />
                </div>
              ) : showMasterPlan ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <MasterPlan onClose={() => setShowMasterPlan(false)} pagesText={pagesText} />
                </div>
              ) : showMindMap ? (
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  <MindMap 
                    pages={pages} 
                    setPages={setPages} 
                    edges={edges} 
                    setEdges={setEdges} 
                    onSaveToMasterPlan={handleSaveToMasterPlan} 
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-hidden">
                  <div className="w-full h-full max-w-5xl mx-auto">
                    <div className="h-full glass-panel rounded-md border border-white/5 flex flex-col overflow-hidden nebula-glow transition-all duration-500">
                      <div className="h-10 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                        </div>
                        <span className="text-xs text-slate-500 font-headline no-bold">{selectedFile ? 'File Preview' : 'Preview Mode'}</span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setShowCodePreview(!showCodePreview);
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-headline no-bold transition-all ${showCodePreview ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-slate-300'}`}
                            >
                              <FileCode className="w-3.5 h-3.5" />
                              <span className="text-[12px]">Code</span>
                            </button>
                            <ExternalLink 
                              className="w-3.5 h-3.5 text-slate-500 cursor-pointer hover:text-slate-300 transition-colors" 
                              onClick={() => handleAction('Deploy')}
                            />
                          </div>
                      </div>
                      <div className="flex-1 relative flex items-center justify-center bg-surface-container-lowest/20 overflow-hidden">
                        {showCodePreview ? (
                          <div className="absolute inset-0 bg-[#1e1e1e] overflow-auto text-13">
                            <SyntaxHighlighter 
                              language={selectedFile?.split('.').pop() === 'json' ? 'json' : 'typescript'} 
                              style={vscDarkPlus} 
                              customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '13px' }}
                            >
{fileContent || `// Nebula Interface Component
import React, { useState } from 'react';

export function NebulaInterface() {
  const [isSynced, setIsSynced] = useState(false);

  const handleSync = () => {
    console.log("Syncing workspace...");
    setIsSynced(true);
  };

  return (
    <div className="nebula-container">
      <h2>Nebula Interface</h2>
      <p>System initialized. Working within the synchronized data-stream.</p>
      <button onClick={handleSync}>
        {isSynced ? 'Workspace Synced' : 'Sync Workspace'}
      </button>
    </div>
  );
}`}
                            </SyntaxHighlighter>
                          </div>
                        ) : (
                          <>
                            <div className="w-full h-full opacity-30 bg-gradient-to-br from-cyan-900/50 to-purple-900/50" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-6">
                              <div className="flex flex-col gap-2">
                                <h2 className="text-2xl font-headline no-bold text-primary">Nebula Interface</h2>
                                <p className="text-13 text-on-surface-variant max-w-sm no-bold leading-relaxed">
                                  System initialized. Ready to build your next architecture.
                                </p>
                              </div>
                              
                              <div className="flex flex-wrap justify-center gap-3 max-w-3xl">
                                <button
                                  type="button"
                                  onClick={() => void startNewProjectFlow('quick')}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl hover:bg-cyan-500/20 transition-all text-sm text-cyan-300 font-headline"
                                >
                                  <Sparkles className="w-4 h-4" />
                                  Quick generate
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void startNewProjectFlow('devpartner')}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition-all text-sm text-purple-300 font-headline"
                                >
                                  <Users className="w-4 h-4" />
                                  Dev partner
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void startNewProjectFlow('github')}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm text-slate-300 font-headline"
                                >
                                  <Github className="w-4 h-4 text-slate-400" />
                                  Clone GitHub
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void startNewProjectFlow('prompt')}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm text-slate-300 font-headline"
                                >
                                  <FileText className="w-4 h-4 text-slate-400" />
                                  Written prompt
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void startNewProjectFlow('upload')}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm text-slate-300 font-headline"
                                >
                                  <Upload className="w-4 h-4 text-slate-400" />
                                  Upload files
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Terminal Splitter */}
          {isTerminalOpen && (
            <div 
              className="h-1 cursor-row-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0" 
              onMouseDown={() => setIsResizing('terminal')} 
            />
          )}

          {/* Terminal Area (Anchored) */}
          <div 
            className="bg-[#040f1a]/60 border-t border-white/5 flex flex-col shrink-0 transition-all duration-300 ease-in-out overflow-hidden" 
            style={{ height: isTerminalOpen ? terminalHeight : 32 }}
          >
            <div 
              className="h-8 px-4 flex items-center justify-between border-b border-white/5 bg-white/10 shrink-0 cursor-pointer select-none"
              onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            >
              <div className="flex items-center gap-2">
                <ChevronDown 
                  className={`w-3.5 h-3.5 text-slate-500 hover:text-cyan-300 transition-transform duration-300 ${!isTerminalOpen ? '-rotate-90' : 'rotate-0'}`}
                />
                <TerminalIcon className="w-3.5 h-3.5 text-cyan-300" />
                <span className="text-[10px] text-cyan-300 font-headline uppercase no-bold">Terminal</span>
              </div>
              <div className="flex items-center gap-2">
                {isTerminalOpen && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setTerminalHistory([]);
                    }}
                    className="text-slate-500 hover:text-cyan-300 transition-colors"
                    title="Clear Terminal"
                  >
                    <span className="material-symbols-outlined text-[16px]">block</span>
                  </button>
                )}
                <ChevronDown 
                  className={`w-3.5 h-3.5 text-slate-500 hover:text-cyan-300 transition-transform duration-300 ${!isTerminalOpen ? '-rotate-90' : 'rotate-0'}`}
                />
              </div>
            </div>
            
            {isTerminalOpen && (
              <div className="flex-1 p-3 font-mono text-[11px] text-slate-400 overflow-y-auto no-bold space-y-2 flex flex-col">
                {terminalHistory.map((item, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex gap-2"><span className="text-cyan-500">λ</span> <span>{item.command}</span></div>
                    <div className="text-slate-500 whitespace-pre-wrap">{item.output}</div>
                  </div>
                ))}
                <div className="flex gap-2 items-center mt-auto">
                  <span className="text-cyan-500">λ</span>
                  <input 
                    type="text" 
                    value={terminalInput}
                    onChange={e => setTerminalInput(e.target.value)}
                    onKeyDown={handleTerminalSubmit}
                    className="flex-1 bg-transparent border-none outline-none text-slate-300 placeholder-slate-600"
                    placeholder="Type a command and press Enter..."
                    autoComplete="off"
                    spellCheck="false"
                  />
                </div>
                <div ref={terminalEndRef} />
              </div>
            )}
          </div>
        </section>

        {/* Right Splitter */}
        <div 
          className="w-1 cursor-col-resize bg-transparent hover:bg-cyan-500/50 active:bg-cyan-500 transition-colors z-10 shrink-0" 
          onMouseDown={() => setIsResizing('right')} 
        />

        {/* 4. Right Sidebar (Kyn Assistant) */}
        <AssistantSidebar
          key={`asst-${projectsSource}-${activeGuestProjectId ?? projectName}`}
          width={rightWidth}
          userId={conversationUserId}
          projectName={projectName}
        />
      </main>

      {showSaveSuccessToast && (
        <div
          className="fixed bottom-20 left-1/2 z-[200] -translate-x-1/2 px-6 py-3 rounded-xl bg-emerald-950/95 border border-emerald-500/35 text-emerald-100 text-sm font-headline shadow-[0_8px_32px_rgba(0,0,0,0.45)] animate-in fade-in zoom-in-95 duration-200"
          role="status"
        >
          Project saved successfully
        </div>
      )}

      {/* BottomNavBar */}
      <footer className="h-10 w-full flex justify-center items-center gap-8 z-50 bg-[#040f1a]/80 backdrop-blur-md border-t border-white/5">
        <button className="text-cyan-300 scale-110 no-bold transition-all active:scale-95 duration-200">
          <Eye className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
          className={`transition-all active:scale-95 duration-200 ${isTerminalOpen ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-100'}`}
          title="Toggle Terminal"
        >
          <TerminalIcon className="w-5 h-5" />
        </button>
        <button className="text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200">
          <History className="w-5 h-5" />
        </button>
        <button className="text-slate-500 hover:text-cyan-100 no-bold transition-all active:scale-95 duration-200">
          <Bug className="w-5 h-5" />
        </button>
      </footer>

      <SimpleLoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        cloudStorageReady={Boolean(config?.cloudStorageReady)}
        onSignedIn={() => setSessionReloadNonce((n) => n + 1)}
      />
    </div>
  );
}
