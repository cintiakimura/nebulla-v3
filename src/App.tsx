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
  CreditCard,
  User
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Mock User type since we removed firebase/auth
interface MockUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role?: 'user' | 'admin' | 'super-admin';
}

const SUPER_ADMIN_EMAIL = 'cintiakimura20@gmail.com';

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
  const [showStitchMockup, setShowStitchMockup] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab | null>('projects');
  
  const [pages, setPages] = useState(initialPages);
  const [edges, setEdges] = useState(initialEdges);

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(160);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'terminal' | null>(null);

  const [isLeftOpen, setIsLeftOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);

  const [user, setUser] = useState<MockUser | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalMessage, setPaymentModalMessage] = useState('');
  const [paymentAction, setPaymentAction] = useState('');
  const [paymentStep, setPaymentStep] = useState<'email' | 'payment'>('email');
  const [leadEmail, setLeadEmail] = useState('');
  const [files, setFiles] = useState<{name: string, isDirectory: boolean}[]>([]);
  const [terminalHistory, setTerminalHistory] = useState<{command: string, output: string}[]>([]);
  const [terminalInput, setTerminalInput] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(console.error);
  }, []);

  const triggerCheckout = async (message?: string) => {
    if (message) {
      setPaymentModalMessage(message);
      setShowPaymentModal(true);
      return;
    }
    
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email || leadEmail })
      });
      const session = await response.json();
      
      if (session.success && session.message) {
        // Super admin bypass
        setIsPaid(true);
        localStorage.setItem('nebula_is_paid', 'true');
        setShowPaymentModal(false);
        alert(session.message);
        return;
      }

      if (session.error) throw new Error(session.error);
      if (session.url) window.location.href = session.url;
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Payment failed. Please try again.');
    }
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalHistory]);

  useEffect(() => {
    // Check for payment success in URL
    const query = new URLSearchParams(window.location.search);
    if (query.get('success')) {
      setIsPaid(true);
      localStorage.setItem('nebula_is_paid', 'true');
      
      // Auto-login if we have a lead email
      const savedLeadEmail = localStorage.getItem('nebula_lead_email');
      if (savedLeadEmail && !user) {
        handleGithubLogin(savedLeadEmail);
      }
      
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Mock authentication check
    const savedUser = localStorage.getItem('nebula_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser) as MockUser;
      setUser(parsedUser);
      
      // Super admin bypass
      if (parsedUser.email === SUPER_ADMIN_EMAIL) {
        setIsPaid(true);
        localStorage.setItem('nebula_is_paid', 'true');
      } else {
        setIsPaid(localStorage.getItem('nebula_is_paid') === 'true');
      }
    }

    // Mock project data loading
    const savedProject = localStorage.getItem('nebula_project_default');
    if (savedProject) {
      const data = JSON.parse(savedProject);
      if (data.pages) setPages(data.pages);
      if (data.edges) setEdges(data.edges);
    }
  }, []);

  useEffect(() => {
    fetch('/api/fs/list')
      .then(res => res.json())
      .then(data => {
        if (data.files) setFiles(data.files);
      })
      .catch(console.error);
  }, []);

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

  const handleSaveToMasterPlan = () => {
    const projectData = { pages, edges };
    localStorage.setItem('nebula_project_default', JSON.stringify(projectData));
    console.log("Saved to Master Plan locally");
  };

  const handleActionRequiresPayment = (actionName: string) => {
    const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
    if (isSuperAdmin || isPaid) {
      if (actionName === 'Login' || actionName === 'Connect') {
        handleGithubLogin();
      } else {
        alert(`${actionName} initiated successfully.`);
      }
      return;
    }

    setPaymentAction(actionName);
    setPaymentStep('email');
    
    let message = '';
    switch (actionName) {
      case 'Download':
        message = 'Take your project with you. Unlock full source code downloads for 19.99€.';
        break;
      case 'Upload':
        message = 'Ready to bring your own assets? Unlock file uploads and full project integration for 19.99€.';
        break;
      case 'Deploy':
        message = 'Launch your vision to the world. Unlock one-click deployments for 19.99€.';
        break;
      case 'View Code':
        message = 'Unlock the full power of Nebula. View, copy, and edit your generated code for a one-time payment of 19.99€.';
        break;
      case 'Connect':
      case 'Login':
        message = 'Save your progress and sync with GitHub. Unlock full account features for a one-time payment of 19.99€.';
        break;
      default:
        message = 'Unlock all premium features of Nebula for a one-time payment of 19.99€.';
    }

    triggerCheckout(message);
  };

  useEffect(() => {
    const handleCopyPaste = (e: ClipboardEvent) => {
      const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL;
      if (!user || (!isPaid && !isSuperAdmin)) {
        e.preventDefault();
        alert('Please log in and subscribe to copy or paste.');
      }
    };

    document.addEventListener('copy', handleCopyPaste);
    document.addEventListener('paste', handleCopyPaste);

    return () => {
      document.removeEventListener('copy', handleCopyPaste);
      document.removeEventListener('paste', handleCopyPaste);
    };
  }, [user, isPaid]);

  const handleLockDesign = () => {
    setShowStitchMockup(false);
    // Return to default view or mind map
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadEmail.trim() || !leadEmail.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }

    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: leadEmail, action: paymentAction })
      });
      localStorage.setItem('nebula_lead_email', leadEmail);
      setPaymentStep('payment');
    } catch (err) {
      console.error('Failed to capture lead:', err);
      // Proceed anyway to not block user
      setPaymentStep('payment');
    }
  };

  const handleGithubLogin = async (overrideEmail?: string) => {
    if (!isPaid && user?.email !== SUPER_ADMIN_EMAIL && !overrideEmail) {
      handleActionRequiresPayment('Connect');
      return;
    }

    // Mock Github Login
    const email = overrideEmail || prompt('Enter email to login (e.g. cintiakimura20@gmail.com):', 'dev@nebula.io') || 'dev@nebula.io';
    
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
    
    const mockUser: MockUser = {
      uid: isSuperAdmin ? 'super-admin-uid' : 'github-mock-uid',
      displayName: isSuperAdmin ? 'Cintia Kimura' : 'Nebula Dev',
      email: email,
      photoURL: isSuperAdmin ? 'https://picsum.photos/seed/cintia/200' : 'https://picsum.photos/seed/nebula-dev/200',
      role: isSuperAdmin ? 'super-admin' : 'user'
    };
    
    setUser(mockUser);
    localStorage.setItem('nebula_user', JSON.stringify(mockUser));

    if (isSuperAdmin || localStorage.getItem('nebula_is_paid') === 'true') {
      setIsPaid(true);
      if (isSuperAdmin) localStorage.setItem('nebula_is_paid', 'true');
    } else {
      triggerCheckout();
    }
  };

  const handleGoogleLogin = async () => {
    if (!isPaid && user?.email !== SUPER_ADMIN_EMAIL) {
      handleActionRequiresPayment('Connect');
      return;
    }

    // Mock Google Login
    const email = prompt('Enter email to login (e.g. cintiakimura20@gmail.com):', 'user@gmail.com') || 'user@gmail.com';
    
    const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
    
    const mockUser: MockUser = {
      uid: isSuperAdmin ? 'super-admin-uid' : 'google-mock-uid',
      displayName: isSuperAdmin ? 'Cintia Kimura' : 'Google User',
      email: email,
      photoURL: isSuperAdmin ? 'https://picsum.photos/seed/cintia/200' : 'https://picsum.photos/seed/google-user/200',
      role: isSuperAdmin ? 'super-admin' : 'user'
    };
    
    setUser(mockUser);
    localStorage.setItem('nebula_user', JSON.stringify(mockUser));

    if (isSuperAdmin || localStorage.getItem('nebula_is_paid') === 'true') {
      setIsPaid(true);
      if (isSuperAdmin) localStorage.setItem('nebula_is_paid', 'true');
    } else {
      triggerCheckout();
    }
  };
  
  const handleLogout = () => {
    setUser(null);
    setIsPaid(false);
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
      <header className="h-12 w-full z-50 flex justify-between items-center px-6 bg-[#040f1a]/60 backdrop-blur-xl border-b border-white/5 shadow-[0_0_20px_rgba(96,0,159,0.05)]">
        <div className="flex items-center gap-3">
          <Logo className="w-6 h-6" />
          <h1 className="font-headline text-lg font-light tracking-tighter text-cyan-300 no-bold">nebulla</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => handleActionRequiresPayment('Deploy')}
            className="text-xs px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded hover:bg-cyan-500/20 transition-colors font-headline flex items-center gap-1"
          >
            <Rocket className="w-3.5 h-3.5" />
            Deploy
          </button>
          <button 
            onClick={() => handleActionRequiresPayment('Download')}
            className="text-xs px-3 py-1.5 bg-white/5 text-slate-300 border border-white/10 rounded hover:bg-white/10 transition-colors font-headline flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
          {user ? (
            <div className="flex items-center gap-3">
              {user.email === SUPER_ADMIN_EMAIL && (
                <span className="text-[10px] px-2 py-0.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-full font-headline uppercase tracking-widest animate-pulse shadow-[0_0_10px_rgba(0,255,255,0.3)]">
                  Super Admin
                </span>
              )}
              <img src={user.photoURL || ''} alt="User" className="w-6 h-6 rounded-full border border-white/10" referrerPolicy="no-referrer" />
              <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-cyan-300 transition-colors font-headline">Logout</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => handleGoogleLogin()} className="text-xs px-3 py-1.5 bg-white text-slate-900 border border-white/10 rounded hover:bg-slate-200 transition-colors font-headline flex items-center gap-2">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
              <button onClick={() => handleGithubLogin()} className="text-xs px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded hover:bg-slate-700 transition-colors font-headline flex items-center gap-2">
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
            title="Stitch Mockup"
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
                <span className="text-cyan-300 font-light tracking-widest text-xs font-headline no-bold uppercase">PROJECT</span>
                <button 
                  onClick={() => setIsLeftOpen(false)}
                  className="text-slate-500 hover:text-cyan-300 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 py-2 flex flex-col px-1 overflow-y-auto font-mono text-13">
                {files.map((file, i) => {
                  const { Icon, color } = getFileIconInfo(file.name, file.isDirectory);
                  return (
                    <div key={i} className={`flex items-center gap-1.5 px-2 h-[22px] text-slate-400 hover:text-cyan-200 hover:bg-white/5 transition-all cursor-pointer ${file.isDirectory ? 'font-bold' : 'ml-4'}`}>
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <span className="no-bold text-[13px] leading-none truncate">{file.name}</span>
                    </div>
                  );
                })}
              </nav>

              {/* Quick Actions */}
              <div className="p-4 border-t border-white/5 space-y-3">
                <span className="text-[10px] text-slate-500 font-headline uppercase tracking-tighter no-bold">Quick Actions</span>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => handleActionRequiresPayment('Connect')}
                    className="flex items-center gap-2 text-13 text-slate-400 hover:text-cyan-300 transition-all no-bold"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    Sync Git
                  </button>
                  <button 
                    onClick={() => handleActionRequiresPayment('Upload')}
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
                  <span className="no-bold">Stitch Mockup</span>
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
                  <span className="no-bold">index.tsx</span>
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
                  <Dashboard activeTab={dashboardTab} onTabChange={setDashboardTab} />
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
                        <span className="text-xs text-slate-500 font-headline no-bold">Preview Mode</span>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                if (isPaid || user?.email === SUPER_ADMIN_EMAIL) {
                                  setShowCodePreview(!showCodePreview);
                                } else {
                                  handleActionRequiresPayment('View Code');
                                }
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-headline no-bold transition-all ${showCodePreview ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10 hover:text-slate-300'}`}
                            >
                              <FileCode className="w-3.5 h-3.5" />
                              <span className="text-[12px]">Code</span>
                            </button>
                            <ExternalLink 
                              className="w-3.5 h-3.5 text-slate-500 cursor-pointer hover:text-slate-300 transition-colors" 
                              onClick={() => handleActionRequiresPayment('Deploy')}
                            />
                          </div>
                      </div>
                      <div className="flex-1 relative flex items-center justify-center bg-surface-container-lowest/20 overflow-hidden">
                        {showCodePreview ? (
                          <div className="absolute inset-0 bg-[#1e1e1e] overflow-auto text-13">
                            <SyntaxHighlighter 
                              language="typescript" 
                              style={vscDarkPlus} 
                              customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '13px' }}
                            >
{`// Nebula Interface Component
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
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center gap-4">
                              <h2 className="text-2xl font-headline no-bold text-primary">Nebula Interface</h2>
                              <p className="text-13 text-on-surface-variant max-w-sm no-bold leading-relaxed">
                                System initialized. Working within the synchronized data-stream.
                              </p>
                              <button className="mt-2 px-6 py-2 bg-primary-container/10 text-primary border border-primary/20 rounded-md text-13 font-headline no-bold hover:bg-primary-container/20 transition-all">
                                Sync Workspace
                              </button>
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
        <AssistantSidebar width={rightWidth} onActionRequiresPayment={handleActionRequiresPayment} />
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

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0b1622] border border-cyan-500/30 rounded-2xl p-8 max-w-md w-full flex flex-col items-center text-center gap-6 shadow-[0_0_50px_rgba(6,182,212,0.15)] animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-2">
              {paymentStep === 'email' ? <User className="w-8 h-8" /> : <CreditCard className="w-8 h-8" />}
            </div>
            
            <h3 className="text-2xl font-headline text-slate-200 no-bold">
              {paymentStep === 'email' ? 'Unlock Nebula' : 'Full Access Unlocked'}
            </h3>
            
            <p className="text-slate-400 text-sm leading-relaxed no-bold">
              {paymentModalMessage}
            </p>

            {paymentStep === 'email' ? (
              <form onSubmit={handleLeadSubmit} className="w-full space-y-4">
                <div className="flex flex-col gap-1.5 text-left">
                  <label className="text-[10px] text-slate-500 uppercase tracking-widest font-headline ml-1">Your Email</label>
                  <input 
                    type="email" 
                    required
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-all font-body"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-3 bg-cyan-500 text-black font-headline no-bold rounded-xl hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                >
                  Continue to Payment
                </button>
                <button 
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full py-2 text-slate-500 hover:text-slate-300 transition-colors text-xs font-headline"
                >
                  Maybe Later
                </button>
              </form>
            ) : (
              <div className="w-full space-y-3">
                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 mb-4 text-left">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400 font-headline uppercase">Plan</span>
                    <span className="text-xs text-cyan-300 font-headline">Lifetime Access</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-headline uppercase">Price</span>
                    <span className="text-lg text-slate-100 font-headline">19.99€</span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    // Real checkout trigger
                    fetch('/api/create-checkout-session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: leadEmail }) // Pass email to Stripe if possible
                    })
                    .then(res => res.json())
                    .then(session => {
                      if (session.url) window.location.href = session.url;
                    })
                    .catch(console.error);
                  }}
                  className="w-full py-3 bg-cyan-500 text-black font-headline no-bold rounded-xl hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                >
                  Pay 19.99€ Once
                </button>
                <button 
                  onClick={() => setPaymentStep('email')}
                  className="w-full py-3 bg-white/5 text-slate-400 font-headline no-bold rounded-xl hover:bg-white/10 transition-all"
                >
                  Back
                </button>
              </div>
            )}
            
            <p className="text-[10px] text-slate-600 uppercase tracking-widest no-bold">
              Everything included • No limits • Lifetime access
            </p>
          </div>
        </div>
      )}
    </>
  );
}
