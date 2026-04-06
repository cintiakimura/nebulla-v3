import React, { useState } from 'react';

const STATIC_SECTIONS = [
  { 
    id: 'objective', 
    title: '1. Objective & Goal & Scope', 
    content: `OBJECTIVE & GOAL & SCOPE\n\nConstruct 'Nebula,' a voice-first Integrated Development Environment (IDE) prototype engineered to circumvent common development pitfalls.\n\nGOAL:\nEnable hands-free, rapid UI prototyping and logic modification without manual typing. Eliminate boilerplate infrastructure setup and environment variable management.\n\nSCOPE:\n- Voice-to-Code Generation\n- Zero-Config Auto-Provisioning (Vercel/Firebase)\n- Live Preview & Terminal Sync` 
  },
  { 
    id: 'roles', 
    title: '2. User Roles', 
    content: `USER ROLES\n\n- Owner/Administrator: Full access to project settings, infrastructure provisioning controls, and environment variable management.\n- Collaborator/Editor: Read/write access to the codebase, voice-command execution, and terminal access.\n- Viewer: Read-only access to code, architecture mind maps, and preview environments.` 
  },
  { 
    id: 'data', 
    title: '3. Data & Models', 
    content: `DATA & MODELS\n\nENTITIES:\n- User\n- Project\n- Environment\n- Deployment\n- VoiceCommandLog (ephemeral)\n\nRELATIONAL STRUCTURE:\n- One-to-many (User -> Project)\n- One-to-one (Project -> Environment)\n\nANTICIPATED VOLUME:\nSmall to medium scale initially, leveraging local storage for state synchronization and document storage.` 
  },
  { 
    id: 'constraints', 
    title: '4. Constraints & Edges', 
    content: `CONSTRAINTS & EDGES\n\n- Hard dependencies on third-party API rate limits (LLM providers, Vercel API, database quotas).\n- Voice-to-text and LLM API rate limits require robust queueing and exponential backoff.\n- Ephemeral voice processing with a strict zero-logging policy for raw audio streams.\n- Cross-origin iframe restrictions for the live preview environment.` 
  },
  { 
    id: 'branding', 
    title: '5. Branding System', 
    content: `BRANDING SYSTEM\n\n- Layout: Fluid responsive design with a glassmorphic aesthetic.\n- Theme: Deep space dark mode (Midnight blues, cyan accents, neon purple highlights).\n- Interaction: Voice-primary navigation. High-contrast visual feedback for voice recognition states (pulsing waves).\n- Typography: Space Grotesk for headlines/labels, Inter for body/UI text, JetBrains Mono for code.` 
  },
  { 
    id: 'competition', 
    title: '7. Competition Analysis', 
    content: `COMPETITION ANALYSIS\n\nCOMPETITORS:\n- Cursor IDE\n- GitHub Copilot Workspace\n- Vercel v0\n\nDIFFERENTIATORS:\n- Voice-First Native: Built from the ground up for spoken natural language, not just text prompts.\n- Zero-Config Infrastructure: Automatically provisions frontend environments upon project creation, removing the "blank canvas" setup friction.` 
  },
  { 
    id: 'pricing', 
    title: '8. Pricing', 
    content: `PRICING STRATEGY\n\n(Draft / TBD)\n\n- Free Tier: Limited voice commands per day, shared preview infrastructure, community support.\n- Pro Tier: Unlimited voice commands, dedicated auto-provisioned environments, private GitHub repo sync.\n- Enterprise: Custom LLM routing, SSO, advanced RBAC, VPC deployments.` 
  },
  { 
    id: 'kpis', 
    title: '9. KPIs', 
    content: `KEY PERFORMANCE INDICATORS (KPIs)\n\n1. Voice-to-Code Generation:\n   - >90% intent recognition accuracy.\n   - Code injects and renders within 3 seconds of releasing the mic.\n   - 0 syntax errors in the generated output.\n\n2. Zero-Config Auto-Provisioning:\n   - 100% automated setup with zero manual API key copying.\n   - Completes in under 15 seconds.\n   - Results in a live "Hello World" deployment URL.\n\n3. Live Preview & Terminal Sync:\n   - Preview updates in <1 second after a code change.\n   - Terminal accurately catches and displays 100% of build/syntax errors without crashing.` 
  },
];

export function MasterPlan({ onClose, pagesText }: { onClose: () => void, pagesText: string }) {
  const PLAN_SECTIONS = [
    ...STATIC_SECTIONS.slice(0, 5),
    {
      id: 'pages',
      title: '6. Pages & Navigation',
      content: pagesText
    },
    ...STATIC_SECTIONS.slice(5)
  ];

  const [activeTab, setActiveTab] = useState(PLAN_SECTIONS[0].id);
  const [isSaved, setIsSaved] = useState(true);

  const activeContent = PLAN_SECTIONS.find(s => s.id === activeTab)?.content;

  const handleSave = () => {
    setIsSaved(true);
    // In a real app, this would persist the plan to the backend
    console.log("Master Plan saved and locked.");
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-md border border-white/5 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-3 text-cyan-300">
          <span className="material-symbols-outlined text-18">menu_book</span>
          <span className="font-headline text-sm tracking-wide">Master Plan</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>lock</span>
            SOURCE OF TRUTH
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSave}
            className="flex items-center gap-1 px-4 py-1.5 bg-primary-container/10 hover:bg-primary-container/20 text-primary rounded text-xs transition-colors border border-primary/20 font-headline"
          >
            <span className="material-symbols-outlined text-14">save</span>
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <div className="w-px h-4 bg-white/10"></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors">
            <span className="material-symbols-outlined text-18">close</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tabs */}
        <div className="w-64 border-r border-white/5 bg-black/20 p-3 flex flex-col gap-1 overflow-y-auto">
          {PLAN_SECTIONS.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveTab(section.id)}
              className={`text-left px-3 py-2.5 rounded-md text-13 transition-all font-headline tracking-wide ${
                activeTab === section.id 
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-[inset_2px_0_0_0_rgba(0,255,255,0.5)]' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
              }`}
            >
              {section.title}
            </button>
          ))}
        </div>

        {/* Content Area (Read-only Doc) */}
        <div className="flex-1 bg-[#020810] p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto bg-white/[0.02] border border-white/5 rounded-xl p-8 min-h-full shadow-lg">
            <pre className="font-mono text-13 text-slate-300 leading-relaxed whitespace-pre-wrap outline-none">
              {activeContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
