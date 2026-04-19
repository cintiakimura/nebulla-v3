/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { AssistantSidebar } from './components/AssistantSidebar';
import { MasterPlan } from './components/MasterPlan';
import { MindMap } from './components/MindMap';
import { StitchMockup } from './components/StitchMockup';
import { Dashboard, DashboardTab } from './components/Dashboard';
import { LandingPage } from './components/LandingPage';
import { Logo } from './components/Logo';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { readResponseJson } from './lib/apiFetch';
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
  User,
  Save,
  PlusCircle,
  Handshake,
  Edit2,
  Github,
  Globe
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

export default function App() {
  const [showLanding, setShowLanding] = useState(true);
  const [showMasterPlan, setShowMasterPlan] = useState(false);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showAuthGuide, setShowAuthGuide] = useState(false);
  const [showStitchMockup, setShowStitchMockup] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab | null>('projects');
  
  const [pages, setPages] = useState(initialPages);
  const [edges, setEdges] = useState(initialEdges);
  const [projectName, setProjectName] = useState('Untitled Project');

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(160);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'terminal' | null>(null);

  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [user, setUser] = useState<MockUser | null>(null);
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
    setShowStitchMockup(false);
    setShowMasterPlan(false);
    setShowMindMap(false);
    setDashboardTab(null);
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

  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(async (res) => readResponseJson(res))
      .then(data => setConfig(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalHistory]);

  useEffect(() => {
    const loadGuestProject = () => {
      const savedProject = localStorage.getItem('nebula_project_default');
      if (savedProject) {
        try {
          const data = JSON.parse(savedProject);
          if (data.pages) setPages(data.pages);
          if (data.edges) setEdges(data.edges);
          if (data.projectName) setProjectName(data.projectName);
        } catch {
          /* ignore */
        }
      }
    };

    if (!isSupabaseConfigured) {
      loadGuestProject();
      return;
    }

    // Real Supabase authentication check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          uid: session.user.id,
          displayName: session.user.user_metadata.full_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || null,
          photoURL: session.user.user_metadata.avatar_url || null,
          role: 'user'
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          uid: session.user.id,
          displayName: session.user.user_metadata.full_name || session.user.email?.split('@')[0] || 'User',
          email: session.user.email || null,
          photoURL: session.user.user_metadata.avatar_url || null,
          role: 'user'
        });
      } else {
        setUser(null);
      }
    });

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            setUser({
              uid: session.user.id,
              displayName: session.user.user_metadata.full_name || session.user.email?.split('@')[0] || 'User',
              email: session.user.email || null,
              photoURL: session.user.user_metadata.avatar_url || null,
              role: 'user'
            });
          }
        });
      }
    };
    window.addEventListener('message', handleMessage);

    // Load project from Supabase if user is logged in
    const loadProject = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', session.user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (data && !error) {
          if (data.pages) setPages(data.pages);
          if (data.edges) setEdges(data.edges);
          if (data.name) setProjectName(data.name);
        }
      } else {
        loadGuestProject();
      }
    };

    loadProject();

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

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
    // Sort pages by X position to represent visual flow left-to-right
    const sortedPages = [...pages].sort((a, b) => a.position.x - b.position.x);
    return `PAGES & NAVIGATION\n\nRULE: Pages and Navigation must stay automatically synchronized with the Mind Map. Any change in Pages & Navigation should update the Mind Map, and any change in the Mind Map should update Pages & Navigation.\n\n` + sortedPages.map((p, i) => `${i + 1}. ${p.data.label}: ${p.data.description}`).join('\n');
  }, [pages]);

  const handleSaveToMasterPlan = async () => {
    const projectData = { pages, edges, projectName };
    
    if (!user) {
      setShowLoginModal(true);
      localStorage.setItem('nebula_project_default', JSON.stringify(projectData));
      console.log("Saved project state locally (Guest)");
      return;
    }
    
    const { error } = await supabase
      .from('projects')
      .upsert({
        user_id: user.uid,
        name: projectName,
        pages: pages,
        edges: edges,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, name' });

    if (error) {
      console.error("Error saving to Supabase:", error);
      alert('Failed to save project to cloud. Saving locally instead.');
    } else {
      console.log("Saved project to Supabase");
    }
    
    localStorage.setItem('nebula_project_default', JSON.stringify(projectData));
    console.log("Saved project state locally");
  };

  const handleAction = (actionName: string) => {
    console.log(`${actionName} initiated.`);
  };

  useEffect(() => {
    (window as any).openMasterPlan = () => {
      setShowMasterPlan(true);
      setShowMindMap(false);
      setShowStitchMockup(false);
      setDashboardTab(null);
      setShowCodePreview(false);
    };

    (window as any).openMindMap = () => {
      setShowMindMap(true);
      setShowMasterPlan(false);
      setShowStitchMockup(false);
      setDashboardTab(null);
      setShowCodePreview(false);
    };

    (window as any).openUIUX = () => {
      setShowStitchMockup(true);
      setShowMindMap(false);
      setShowMasterPlan(false);
      setDashboardTab(null);
      setShowCodePreview(false);
    };

    (window as any).openPreview = () => {
      setShowCodePreview(false);
      setShowStitchMockup(false);
      setShowMindMap(false);
      setShowMasterPlan(false);
      setDashboardTab(null);
    };

    (window as any).syncMindMapFromMasterPlan = async () => {
      try {
        const res = await fetch('/api/master-plan/read');
        if (!res.ok) return;
        const plan = await readResponseJson<Record<string, string>>(res);
        const section7 = plan["7. Pages and navigation"];
        
        if (!section7) return;

        // Flexible parser for Section 7
        // Handles "1. Page", "- Page", "* Page", or just "Page"
        const lines = section7.split('\n')
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
      setShowStitchMockup(true);
      setShowMindMap(false);
      setShowMasterPlan(false);
      setDashboardTab(null);
    };

    return () => {
      delete (window as any).startUIUXWorkflow;
    };
  }, []);

  const handleLockDesign = () => {
    setShowStitchMockup(false);
    // Return to default view or mind map
  };

  const handleGithubLogin = async () => {
    if (!isSupabaseConfigured) {
      console.warn('Supabase is not configured; add SUPABASE_URL and SUPABASE_ANON_KEY to .env');
      return;
    }
    const redirectUrl = `${window.location.origin}/auth/callback`;
    console.log("[AUTH] Initiating GitHub login with redirect:", redirectUrl);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true
      }
    });
    
    if (error) {
      console.error("GitHub Login Error:", error.message);
      return;
    }

    if (data?.url) {
      window.open(data.url, 'nebula_auth_popup', 'width=600,height=700');
    }
  };

  const handleGoogleLogin = async () => {
    if (!isSupabaseConfigured) {
      console.warn('Supabase is not configured; add SUPABASE_URL and SUPABASE_ANON_KEY to .env');
      return;
    }
    const redirectUrl = `${window.location.origin}/auth/callback`;
    console.log("[AUTH] Initiating Google login with redirect:", redirectUrl);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true
      }
    });
    
    if (error) {
      console.error("Google Login Error:", error.message);
      return;
    }

    if (data?.url) {
      window.open(data.url, 'nebula_auth_popup', 'width=600,height=700');
    }
  };
  
  const handleLogout = async () => {
    if (!isSupabaseConfigured) {
      setUser(null);
      localStorage.removeItem('nebula_user');
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('nebula_user');
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

  if (showLanding) {
    return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  return (
    <>
      {/* TopAppBar */}
      <header className="h-16 w-full z-50 flex justify-between items-center px-8 bg-[#040f1a]/60 backdrop-blur-xl border-b border-white/5 shadow-[0_0_20px_rgba(96,0,159,0.05)]">
        <div className="flex items-center gap-4">
          <Logo className="w-12 h-12" />
          <h1 className="font-headline text-4xl font-light tracking-tighter text-cyan-300 no-bold">nebulla</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Action buttons removed as requested */}
          {user ? (
            <div className="flex items-center gap-3">
              <img src={user.photoURL || ''} alt="User" className="w-6 h-6 rounded-full border border-white/10" referrerPolicy="no-referrer" />
              <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-cyan-300 transition-colors font-headline">Logout</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLoginModal(true)} className="text-xs px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded hover:bg-cyan-500/20 transition-colors font-headline flex items-center gap-2">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
              <button onClick={() => setShowLoginModal(true)} className="text-xs px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded hover:bg-slate-700 transition-colors font-headline flex items-center gap-2">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                GitHub
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
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
          <button className="text-slate-500 hover:text-cyan-300 transition-all">
            <Search className="w-5 h-5" />
          </button>
          
          <div className="w-8 h-[1px] bg-white/10 my-1"></div>
          <button 
            onClick={() => { setShowStitchMockup(true); setShowMindMap(false); setShowMasterPlan(false); setDashboardTab(null); }}
            className={`transition-all ${showStitchMockup ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Nebulla UI Studio"
          >
            <Palette className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setShowMindMap(true); setShowMasterPlan(false); setShowStitchMockup(false); setDashboardTab(null); }}
            className={`transition-all ${showMindMap ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Mind Map"
          >
            <Network className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setShowMasterPlan(true); setShowMindMap(false); setShowStitchMockup(false); setDashboardTab(null); }}
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
            onClick={() => { setDashboardTab('projects'); setShowStitchMockup(false); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`transition-all ${dashboardTab === 'projects' ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="User Projects"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>

          <button 
            onClick={() => { setDashboardTab('project-settings'); setShowStitchMockup(false); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`transition-all ${dashboardTab === 'project-settings' ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Project Settings"
          >
            <Server className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { setDashboardTab('secrets'); setShowStitchMockup(false); setShowMindMap(false); setShowMasterPlan(false); }}
            className={`transition-all ${dashboardTab === 'secrets' ? 'text-cyan-300' : 'text-slate-500 hover:text-cyan-300'}`}
            title="Secrets & Integrations"
          >
            <Key className="w-5 h-5" />
          </button>

          <div className="mt-auto flex flex-col gap-6 mb-4">
            <button 
              onClick={() => { setDashboardTab('user-settings'); setShowStitchMockup(false); setShowMindMap(false); setShowMasterPlan(false); }}
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
            <aside className="flex flex-col border-r border-white/5 bg-[#040f1a]/30 shrink-0" style={{ width: leftWidth }}>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
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
              <nav className="flex-1 py-2 flex flex-col px-1 overflow-y-auto font-mono text-13">
                {files.map((file, i) => {
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
                  {!user && (
                    <button 
                      onClick={() => setShowLoginModal(true)}
                      className="flex items-center gap-2 text-13 text-cyan-400 hover:text-cyan-300 transition-all no-bold"
                    >
                      <User className="w-3.5 h-3.5" />
                      Login to Save
                    </button>
                  )}
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
                    Upload
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
        <section className="flex flex-col overflow-hidden flex-1">
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
                     dashboardTab === 'secrets' ? 'Secrets & Integrations' : 'User Settings'}
                  </span>
                </>
              ) : showStitchMockup ? (
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
                setShowStitchMockup(false);
                setShowMasterPlan(false);
                setShowMindMap(false);
              }} />
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 p-6 overflow-y-auto bg-black/20 relative flex flex-col">
            <div className="flex-1 flex flex-col gap-6">
              {dashboardTab ? (
                <div className="flex-1 flex flex-col">
                  <Dashboard 
                    activeTab={dashboardTab} 
                    onTabChange={setDashboardTab} 
                    projectName={projectName}
                    onProjectNameChange={(name) => {
                      setProjectName(name);
                      localStorage.setItem('nebula_project_default', JSON.stringify({ pages, edges, projectName: name }));
                    }}
                  />
                </div>
              ) : showStitchMockup ? (
                <div className="flex-1 flex flex-col">
                  <StitchMockup onLock={handleLockDesign} pagesText={pagesText} />
                </div>
              ) : showMasterPlan ? (
                <div className="flex-1 flex flex-col">
                  <MasterPlan onClose={() => setShowMasterPlan(false)} pagesText={pagesText} />
                </div>
              ) : showMindMap ? (
                <div className="flex-1 flex flex-col">
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
                              
                              <div className="flex flex-wrap justify-center gap-3">
                                <button 
                                  onClick={() => {
                                    const prompt = window.prompt('Paste your written prompt:');
                                    if (prompt && (window as any).nebula_handleSendText) {
                                      (window as any).nebula_handleSendText(prompt);
                                    }
                                  }}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl hover:bg-cyan-500/20 transition-all text-sm text-cyan-300 font-headline"
                                >
                                  <PlusCircle className="w-4 h-4" />
                                  Written Prompt
                                </button>
                                
                                <button 
                                  onClick={() => {
                                    const repo = window.prompt('Paste GitHub repository link:');
                                    if (repo && (window as any).nebula_handleSendText) {
                                      (window as any).nebula_handleSendText(`I want to clone and analyze this GitHub repository: ${repo}`);
                                    }
                                  }}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-sm text-slate-300 font-headline"
                                >
                                  <Save className="w-4 h-4 text-slate-400" />
                                  Clone GitHub
                                </button>

                                <button 
                                  onClick={() => {
                                    if ((window as any).nebula_toggleLive) {
                                      (window as any).nebula_toggleLive();
                                    }
                                  }}
                                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition-all text-sm text-purple-300 font-headline"
                                >
                                  <Handshake className="w-4 h-4" />
                                  Brainstorm
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
          width={rightWidth}
          userId={conversationUserId}
          projectName={projectName}
        />
      </main>

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

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-white/10 flex flex-col gap-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-headline text-slate-100">Login / Sign up & Sync</h2>
                <p className="text-slate-400 text-sm">Continue to the provider login/sync page, then return automatically to Nebula.</p>
              </div>
              <button 
                onClick={() => setShowLoginModal(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  handleGithubLogin();
                  setShowLoginModal(false);
                }}
                className="w-full py-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-3 text-slate-200 hover:bg-white/10 transition-all font-headline"
              >
                <Github className="w-5 h-5" />
                Continue with GitHub
              </button>
              <button 
                onClick={() => {
                  handleGoogleLogin();
                  setShowLoginModal(false);
                }}
                className="w-full py-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center gap-3 text-slate-200 hover:bg-white/10 transition-all font-headline"
              >
                <Globe className="w-5 h-5" />
                Continue with Google
              </button>
            </div>

            <div className="pt-4 border-t border-white/5">
              <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest">
                By continuing, you agree to our Terms of Service
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Auth Guide Modal */}
      <AuthGuideModal isOpen={showAuthGuide} onClose={() => setShowAuthGuide(false)} />
    </>
  );
}

function AuthGuideModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [status, setStatus] = useState<{ url: boolean, key: boolean }>({ url: false, key: false });

  useEffect(() => {
    fetch('/api/config')
      .then(async (res) => readResponseJson<{ supabaseUrl?: string; supabaseAnonKey?: string }>(res))
      .then(config => {
        setStatus({
          url: !!config.supabaseUrl,
          key: !!config.supabaseAnonKey
        });
      })
      .catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;
  
  const callbackUrl = `${window.location.origin}/auth/callback`;
  
  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b1219] border border-white/10 rounded-2xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-cyan-300">
              <Key className="w-5 h-5" />
              <h2 className="text-xl font-headline font-normal">OAuth Setup Guide</h2>
            </div>
            <div className="flex gap-4 mt-1">
              <span className={`text-[10px] flex items-center gap-1 ${status.url ? 'text-green-400' : 'text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.url ? 'bg-green-400' : 'bg-red-400'}`}></span>
                SUPABASE_URL
              </span>
              <span className={`text-[10px] flex items-center gap-1 ${status.key ? 'text-green-400' : 'text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.key ? 'bg-green-400' : 'bg-red-400'}`}></span>
                SUPABASE_ANON_KEY
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <section className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/5">
            <h3 className="text-sm font-headline text-slate-200 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px]">1</span>
              Configure Supabase (Critical)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed pl-7">
              Supabase needs to know this specific preview environment is allowed. 
              Go to your <a href="https://supabase.com/dashboard/project/_/auth/url-configuration" target="_blank" className="text-cyan-400 hover:underline">Supabase Dashboard</a> &gt; <b>Auth</b> &gt; <b>URL Configuration</b> and add this exactly to <b>"Additional Redirect URIs"</b>:
            </p>
            <div className="ml-7 p-3 bg-black/40 border border-white/5 rounded-lg flex items-center justify-between group">
              <code className="text-[10px] text-cyan-500 font-mono break-all">{callbackUrl}</code>
              <button 
                onClick={() => { navigator.clipboard.writeText(callbackUrl); alert('Copied!'); }}
                className="p-1 px-2 text-[10px] bg-white/5 hover:bg-white/10 text-slate-400 rounded transition-all"
              >
                Copy
              </button>
            </div>
          </section>

          <section className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/5">
            <h3 className="text-sm font-headline text-slate-200 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px]">2</span>
              Configure Google Cloud (Fixes "Access Blocked")
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed pl-7">
              If Google says "Blocked" or "Redirect URI mismatch", you must whitelist your unique <b>Supabase Auth URL</b> in the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-cyan-400 hover:underline">Google Cloud Console</a>.
            </p>
            <p className="text-[10px] text-slate-500 pl-7 italic">
              Find this URL in Supabase under Auth &gt; Providers &gt; Google (it's labeled as "Callback URL"). 
              <b> It will look like: <code>https://[your-id].supabase.co/auth/v1/callback</code></b>
            </p>
          </section>

          <section className="space-y-3 p-4 bg-white/5 rounded-xl border border-white/5">
            <h3 className="text-sm font-headline text-slate-200 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px]">3</span>
              Fix GitHub Redirects
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed pl-7">
              If GitHub opens your website instead of the IDE, it's because Step 1 wasn't completed properly. GitHub defaults to your main "Site URL" if the redirect URI isn't exactly matched in your Supabase whitelist.
            </p>
          </section>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-3 bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 rounded-xl hover:bg-cyan-500/30 transition-all font-headline text-sm"
        >
          I've updated my settings
        </button>
      </div>
    </div>
  );
}
