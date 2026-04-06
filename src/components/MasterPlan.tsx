import React, { useState } from 'react';

const STATIC_SECTIONS = [
  { 
    id: 'problem', 
    title: '1. The Problem We’re Solving', 
    content: `THE PROBLEM WE’RE SOLVING\n\n(Content to be updated by Grok B)` 
  },
  { 
    id: 'target', 
    title: '2. Target User & Context', 
    content: `TARGET USER & CONTEXT\n\n(Content to be updated by Grok B)` 
  },
  { 
    id: 'must-have', 
    title: '3. Must-Have Features', 
    content: `MUST-HAVE FEATURES\n\n(Content to be updated by Grok B)` 
  },
  { 
    id: 'nice-to-have', 
    title: '4. Nice-to-Have Features', 
    content: `NICE-TO-HAVE FEATURES\n\n(Content to be updated by Grok B)` 
  },
  { 
    id: 'scale', 
    title: '5. User Scale & Load', 
    content: `USER SCALE & LOAD\n\n(Content to be updated by Grok B)` 
  },
  { 
    id: 'data', 
    title: '6. Data Requirements', 
    content: `DATA REQUIREMENTS\n\n(Content to be updated by Grok B)` 
  },
  { 
    id: 'accessibility', 
    title: '7. Accessibility & Inclusivity', 
    content: `ACCESSIBILITY & INCLUSIVITY\n\n(Content to be updated by Grok B)` 
  },
  { 
    id: 'research', 
    title: '9. Market & Tech Research', 
    content: `MARKET & TECH RESEARCH\n\n(Content to be updated by Grok B)` 
  },
];

export function MasterPlan({ onClose, pagesText }: { onClose: () => void, pagesText: string }) {
  const PLAN_SECTIONS = [
    ...STATIC_SECTIONS.slice(0, 7),
    {
      id: 'pages',
      title: '8. Pages & Navigation',
      content: pagesText
    },
    ...STATIC_SECTIONS.slice(7)
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
