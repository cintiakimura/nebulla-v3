import React from 'react';
import { PlusCircle, Handshake, Github, Save } from 'lucide-react';

export type DashboardTab = 'projects' | 'project-settings' | 'user-settings' | 'secrets';

interface DashboardProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
}

export function Dashboard({ activeTab, onTabChange, projectName, onProjectNameChange }: DashboardProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#040f1a]/40 backdrop-blur-sm border border-white/5 rounded-lg overflow-hidden">
      {/* Dashboard Header */}
      <div className="h-14 border-b border-white/5 bg-white/5 flex items-center px-6 shrink-0">
        <h2 className="text-lg font-headline text-cyan-300 flex items-center gap-2">
          <span className="material-symbols-outlined">
            {activeTab === 'projects' ? 'grid_view' :
             activeTab === 'project-settings' ? 'dns' :
             activeTab === 'secrets' ? 'key' : 'settings'}
          </span>
          {activeTab === 'projects' ? 'User Projects' :
           activeTab === 'project-settings' ? 'Project Settings' :
           activeTab === 'secrets' ? 'Secrets & Integrations' : 'User Settings'}
        </h2>
      </div>

      {/* Dashboard Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'projects' && (
            <ProjectsTab 
              projectName={projectName} 
              onProjectNameChange={onProjectNameChange} 
            />
          )}
          {activeTab === 'project-settings' && <ProjectSettingsTab />}
          {activeTab === 'secrets' && <SecretsTab />}
          {activeTab === 'user-settings' && <UserSettingsTab />}
        </div>
      </div>
    </div>
  );
}

function ProjectsTab({ projectName, onProjectNameChange }: { projectName: string, onProjectNameChange: (name: string) => void }) {
  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Create New Project</h3>
        <p className="text-sm text-slate-500 mb-6">Choose a starting point for your next architecture.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* New Project Starters */}
        <div className="p-6 border border-cyan-500/30 rounded-xl bg-cyan-500/5 hover:bg-cyan-500/10 transition-all cursor-pointer group flex flex-col items-center text-center gap-4"
          onClick={() => {
            const prompt = window.prompt('Paste your written prompt:');
            if (prompt && (window as any).nebula_handleSendText) {
              (window as any).nebula_handleSendText(prompt);
            }
          }}
        >
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-slate-200 font-headline mb-1 group-hover:text-cyan-300 transition-colors">Written Prompt</h4>
            <p className="text-xs text-slate-500">Generate from a description</p>
          </div>
        </div>

        <div className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all cursor-pointer group flex flex-col items-center text-center gap-4"
          onClick={() => {
            const repo = window.prompt('Paste GitHub repository link:');
            if (repo && (window as any).nebula_handleSendText) {
              (window as any).nebula_handleSendText(`I want to clone and analyze this GitHub repository: ${repo}`);
            }
          }}
        >
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-slate-400 group-hover:text-white transition-colors">
            <Github className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-slate-200 font-headline mb-1 group-hover:text-cyan-300 transition-colors">Clone GitHub</h4>
            <p className="text-xs text-slate-500">Import existing repository</p>
          </div>
        </div>

        <div className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all cursor-pointer group flex flex-col items-center text-center gap-4"
          onClick={() => {
            if ((window as any).nebula_toggleLive) {
              (window as any).nebula_toggleLive();
            }
          }}
        >
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
            <Handshake className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-slate-200 font-headline mb-1 group-hover:text-cyan-300 transition-colors">Brainstorm</h4>
            <p className="text-xs text-slate-500">Collaborate with AI partner</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsTab() {
  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Project Settings</h3>
        <p className="text-sm text-slate-500 mb-6">Manage project-specific configurations and preferences.</p>
      </div>

      <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-xl bg-white/5">
        <span className="material-symbols-outlined text-slate-600 text-4xl mb-4">settings_suggest</span>
        <p className="text-slate-500 text-sm font-headline">No settings configured for this project yet.</p>
      </div>
    </div>
  );
}

function SecretsTab() {
  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Secrets & Integrations</h3>
        <p className="text-sm text-slate-500 mb-6">Manage API keys, environment variables, and third-party connections.</p>
      </div>

      {/* Environment Variables */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h4 className="text-sm font-headline text-slate-200 mb-2">Environment Variables</h4>
        <p className="text-xs text-slate-500 mb-4">Securely store secrets. These are encrypted at rest and injected at runtime.</p>
        
        <div className="flex gap-3 mb-6">
          <input 
            type="text" 
            placeholder="Key (e.g. STRIPE_SECRET_KEY)" 
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm w-1/3 text-slate-300 focus:border-cyan-500/50 outline-none font-mono" 
          />
          <input 
            type="password" 
            placeholder="Value" 
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm flex-1 text-slate-300 focus:border-cyan-500/50 outline-none font-mono" 
          />
          <button className="px-5 py-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors text-sm font-headline">
            Add
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-500 text-lg">key</span>
              <span className="text-sm text-slate-300 font-mono">GROK_API_NEBULLA</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">Active</span>
              <button className="text-slate-500 hover:text-red-400 transition-colors"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-500 text-lg">database</span>
              <span className="text-sm text-slate-300 font-mono">SUPABASE_URL</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">Active</span>
              <button className="text-slate-500 hover:text-red-400 transition-colors"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-500 text-lg">api</span>
              <span className="text-sm text-slate-300 font-mono">STITCH_API_KEY</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">Active</span>
              <button className="text-slate-500 hover:text-red-400 transition-colors"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-500 text-lg">key</span>
              <span className="text-sm text-slate-300 font-mono">BUILDER_PRIVATE_KEY</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">Active</span>
              <button className="text-slate-500 hover:text-red-400 transition-colors"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-slate-500 text-lg">cloud</span>
              <span className="text-sm text-slate-300 font-mono">VERCEL_TOKEN_19_MAR</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">Active</span>
              <button className="text-slate-500 hover:text-red-400 transition-colors"><span className="material-symbols-outlined text-[18px]">delete</span></button>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border border-red-500/20 rounded-lg bg-red-500/5 opacity-60">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400 text-lg">payments</span>
              <span className="text-sm text-red-300 font-mono">STRIPE_SECRET_KEY</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-red-400 font-headline">DISABLED</span>
              <button className="text-slate-500 cursor-not-allowed"><span className="material-symbols-outlined text-[18px]">lock</span></button>
            </div>
          </div>
        </div>
      </div>

      {/* OAuth Integration */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h4 className="text-sm font-headline text-slate-200 mb-2">OAuth Integration (Supabase)</h4>
        <p className="text-xs text-slate-500 mb-4">Configure your OAuth providers in the Supabase Dashboard.</p>
        
        <div className="space-y-4">
          <div className="p-4 border border-cyan-500/20 rounded-lg bg-cyan-500/5">
            <h5 className="text-xs font-headline text-cyan-300 mb-2 uppercase tracking-wider">Required Redirect URL</h5>
            <div className="flex items-center gap-3 bg-black/40 p-3 rounded-md border border-white/5">
              <code className="text-[11px] text-slate-300 flex-1 break-all">
                {window.location.origin}/auth/callback
              </code>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/auth/callback`);
                  alert('Copied to clipboard!');
                }}
                className="text-slate-500 hover:text-cyan-300 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Add this URL to your Supabase project under <strong>Auth &gt; URL Configuration &gt; Redirect URLs</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Integrations */}
      <div>
        <h4 className="text-sm font-headline text-slate-200 mb-4">Connected Services</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 border border-white/10 rounded-xl bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-white">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </div>
              <div>
                <div className="text-sm text-slate-200 font-headline">GitHub</div>
                <div className="text-xs text-slate-500">Connected to @nebula-user</div>
              </div>
            </div>
            <button className="text-xs text-slate-400 hover:text-red-400 transition-colors">Disconnect</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserSettingsTab() {
  return (
    <div className="space-y-8 max-w-2xl animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">User Settings</h3>
        <p className="text-sm text-slate-500 mb-6">Manage your profile, preferences, and account security.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
        <h4 className="text-sm font-headline text-slate-200 border-b border-white/5 pb-2">Profile Information</h4>
        
        <div className="flex items-center gap-6">
          <div className="relative group cursor-pointer">
            <div className="w-20 h-20 rounded-full bg-cyan-900/50 border border-cyan-500/30 flex items-center justify-center text-cyan-300 text-2xl font-headline overflow-hidden">
              N
            </div>
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
              <span className="material-symbols-outlined text-white">photo_camera</span>
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-headline">Display Name</label>
              <input 
                type="text" 
                defaultValue="Nebula User" 
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-300 focus:border-cyan-500/50 outline-none transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 uppercase tracking-wider font-headline">Email Address</label>
              <input 
                type="email" 
                defaultValue="user@example.com" 
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-300 focus:border-cyan-500/50 outline-none transition-colors" 
              />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button className="px-6 py-2 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-lg hover:bg-cyan-500/20 transition-colors text-sm font-headline">
            Save Changes
          </button>
        </div>
      </div>

      <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-6">
        <h4 className="text-sm font-headline text-red-400 mb-2">Danger Zone</h4>
        <p className="text-xs text-slate-500 mb-4">Permanently delete your account and all associated data. This action cannot be undone.</p>
        <button className="px-5 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-headline">
          Delete Account
        </button>
      </div>
    </div>
  );
}
