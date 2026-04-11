import React, { useState, useEffect } from 'react';
import { BookOpen, Lock, Save, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function MasterPlan({ onClose, pagesText }: { onClose: () => void, pagesText: string }) {
  const [planData, setPlanData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/master-plan/read')
      .then(res => res.json())
      .then(data => {
        setPlanData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching master plan:", err);
        setLoading(false);
      });
  }, []);

  const STATIC_TITLES = [
    '1. The problem we are solving',
    '2. Target user and context',
    '3. Core features',
    '4. User scale and load',
    '5. Data requirements',
    '6. Accessibility and inclusivity',
    '7. Pages and navigation',
    '8. Market and tech research'
  ];

  const PLAN_SECTIONS = STATIC_TITLES.map((title, index) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let content = planData[title] || '';
    
    // Special case for Pages and Navigation which is dynamic from Mind Map
    if (index === 6) {
      content = pagesText;
    }

    return { id, title, content };
  });

  const [activeTab, setActiveTab] = useState(PLAN_SECTIONS[0].id);
  const [isSaved, setIsSaved] = useState(true);

  const activeSection = PLAN_SECTIONS.find(s => s.id === activeTab);
  const activeContent = activeSection?.content || (loading ? 'Loading...' : 'No content generated yet by GROK B.');

  const handleSave = () => {
    setIsSaved(true);
    console.log("Master Plan saved and locked.");
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-md border border-white/5 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-3 text-cyan-300">
          <BookOpen className="w-4.5 h-4.5" />
          <span className="font-headline text-sm tracking-wide">Master Plan</span>
          <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            SOURCE OF TRUTH
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSave}
            className="flex items-center gap-1 px-4 py-1.5 bg-primary-container/10 hover:bg-primary-container/20 text-primary rounded text-xs transition-colors border border-primary/20 font-headline"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <div className="w-px h-4 bg-white/10"></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors">
            <X className="w-4.5 h-4.5" />
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
          <div className="max-w-3xl mx-auto bg-white/[0.02] border border-white/5 rounded-xl p-8 min-h-full shadow-lg prose prose-invert prose-sm max-w-none prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/10 prose-pre:p-2 prose-pre:rounded-md prose-table:border prose-table:border-white/10 prose-th:bg-white/5 prose-th:p-2 prose-td:p-2 prose-td:border-t prose-td:border-white/10">
            <ReactMarkdown>
              {activeContent || ''}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
