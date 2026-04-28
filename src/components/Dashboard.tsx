import React, { useEffect, useState } from 'react';
import { Github, FolderOpen, Trash2, Sparkles, Users, FileText, Upload, Save, Globe, Plus, Pencil, X } from 'lucide-react';
import { NEBULLA_GROK_KEY_STORAGE } from '../lib/grokKey';
import {
  loadProjectSecrets,
  saveProjectSecrets,
  newSecretId,
  loadProjectSettings,
  saveProjectSettings,
  type SecretEntry,
  type SecretCategory,
  type ProjectSettingsStored,
} from '../lib/nebulaDashboardStorage';

export type DashboardTab = 'projects' | 'project-settings' | 'user-settings' | 'secrets' | 'dns';

interface DashboardProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  projects: { key: string; name: string; updatedAt: string }[];
  activeProjectKey: string;
  onOpenProject: (key: string) => void;
  onDeleteProject: (key: string) => void;
  onStartFlow: (kind: 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload') => void;
}

export function Dashboard({
  activeTab,
  onTabChange,
  projectName,
  onProjectNameChange,
  projects,
  activeProjectKey,
  onOpenProject,
  onDeleteProject,
  onStartFlow,
}: DashboardProps) {
  return (
    <div className="flex-1 flex flex-col h-full bg-[#040f1a]/40 backdrop-blur-sm border border-white/5 rounded-lg overflow-hidden">
      {/* Dashboard Header */}
      <div className="h-14 border-b border-white/5 bg-white/5 flex items-center px-6 shrink-0">
        <h2 className="text-lg font-headline text-cyan-300 flex items-center gap-2">
          <span className="material-symbols-outlined">
            {activeTab === 'projects' ? 'grid_view' :
             activeTab === 'project-settings' ? 'dns' :
             activeTab === 'secrets' ? 'key' :
             activeTab === 'dns' ? 'public' : 'settings'}
          </span>
          {activeTab === 'projects' ? 'My Projects' :
           activeTab === 'project-settings' ? 'Project Settings' :
           activeTab === 'secrets' ? 'Secrets and Integrations' :
           activeTab === 'dns' ? 'DNS & domain' : 'User Settings'}
        </h2>
      </div>

      {/* Dashboard Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {activeTab === 'projects' && (
            <ProjectsTab
              projectName={projectName}
              onProjectNameChange={onProjectNameChange}
              projects={projects}
              activeProjectKey={activeProjectKey}
              onOpenProject={onOpenProject}
              onDeleteProject={onDeleteProject}
              onStartFlow={onStartFlow}
            />
          )}
          {activeTab === 'project-settings' && (
            <ProjectSettingsTab
              projectName={projectName}
              onProjectNameChange={onProjectNameChange}
              activeProjectKey={activeProjectKey}
            />
          )}
          {activeTab === 'secrets' && <SecretsTab activeProjectKey={activeProjectKey} />}
          {activeTab === 'dns' && <DnsTab />}
          {activeTab === 'user-settings' && <UserSettingsTab />}
        </div>
      </div>
    </div>
  );
}

function ProjectsTab({
  projectName,
  onProjectNameChange,
  projects,
  activeProjectKey,
  onOpenProject,
  onDeleteProject,
  onStartFlow,
}: {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  projects: { key: string; name: string; updatedAt: string }[];
  activeProjectKey: string;
  onOpenProject: (key: string) => void;
  onDeleteProject: (key: string) => void;
  onStartFlow: (kind: 'quick' | 'devpartner' | 'github' | 'prompt' | 'upload') => void;
}) {
  const formatWhen = (iso: string) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-10 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Your projects</h3>
        <p className="text-sm text-slate-500 mb-4">
          Open a saved workspace, rename the active one below, or remove a project you no longer need.
        </p>
        <div className="mb-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-wider text-slate-500 font-headline">Active project name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
            />
          </div>
        </div>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500 border border-dashed border-white/10 rounded-xl p-6 text-center">
            No saved projects yet. Start a new blank workspace with one of the flows below.
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => {
              const isActive = p.key === activeProjectKey;
              return (
                <li
                  key={p.key}
                  className={`flex flex-wrap items-center gap-2 justify-between rounded-xl border px-4 py-3 ${
                    isActive ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-100 font-headline truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-500">Updated {formatWhen(p.updatedAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => onOpenProject(p.key)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-headline bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/25"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Open
                      </button>
                    )}
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-wider text-cyan-400/90 font-headline">Active</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteProject(p.key)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Create new project</h3>
        <p className="text-sm text-slate-500 mb-6">
          Every new project starts as a blank workspace by default. Pick a flow below—Nebulla will use your choice from there.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => void onStartFlow('quick')}
            className="p-6 border border-cyan-500/30 rounded-xl bg-cyan-500/5 hover:bg-cyan-500/10 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Quick generate</h4>
              <p className="text-xs text-slate-500">Have a short conversation with Nebula, then we auto-generate the full app</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('devpartner')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-slate-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Dev partner</h4>
              <p className="text-xs text-slate-500">Participate and approve every section of the project development</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('github')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-slate-400">
              <Github className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Clone from GitHub</h4>
              <p className="text-xs text-slate-500">Importing an existing repository</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('prompt')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Written prompt</h4>
              <p className="text-xs text-slate-500">Give a detailed written description and we build from it</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void onStartFlow('upload')}
            className="p-6 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex flex-col items-center text-center gap-4 text-left min-h-[180px]"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-headline mb-1">Upload files</h4>
              <p className="text-xs text-slate-500">Upload your own project files</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsTab({
  projectName,
  onProjectNameChange,
  activeProjectKey,
}: {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  activeProjectKey: string;
}) {
  const [fields, setFields] = useState<ProjectSettingsStored>(() => loadProjectSettings(activeProjectKey));
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setFields(loadProjectSettings(activeProjectKey));
  }, [activeProjectKey]);

  const setField = <K extends keyof ProjectSettingsStored>(key: K, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveProjectSettings(activeProjectKey, fields);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300 max-w-3xl">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Project Settings</h3>
        <p className="text-sm text-slate-500 mb-6">
          Identity and paths for the active project (<span className="font-mono text-cyan-500/80">{activeProjectKey}</span>
          ). Stored in this browser only until your control plane syncs to Render or your repo.
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-white/10 bg-white/5 p-6">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Project name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="Untitled Project"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
          />
          <p className="text-[11px] text-slate-600 mt-1">Shown in the header and assistant; same as My Projects rename.</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">Local folder path</label>
          <input
            type="text"
            value={fields.localFolderPath}
            onChange={(e) => setField('localFolderPath', e.target.value)}
            placeholder="/Users/you/projects/my-app or C:\dev\my-app"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">GitHub repository</label>
          <input
            type="text"
            value={fields.githubRepository}
            onChange={(e) => setField('githubRepository', e.target.value)}
            placeholder="https://github.com/org/repo or org/repo"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
            Client ID (Render workspace ID)
          </label>
          <input
            type="text"
            value={fields.renderWorkspaceId}
            onChange={(e) => setField('renderWorkspaceId', e.target.value)}
            placeholder="Render workspace_id — server-side only in production"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
          />
          <p className="text-[11px] text-slate-600 mt-1">Internal Render workspace identifier for this tenant boundary.</p>
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-1">
            Project ID (Render project / service ID)
          </label>
          <input
            type="text"
            value={fields.renderProjectId}
            onChange={(e) => setField('renderProjectId', e.target.value)}
            placeholder="Nebulla project id or Render service id"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-headline bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 hover:bg-cyan-500/25"
          >
            <Save className="w-4 h-4" />
            {savedFlash ? 'Saved' : 'Save project settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DnsTab() {
  const [customDomain, setCustomDomain] = useState('');

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1 flex items-center gap-2">
          <Globe className="w-6 h-6" />
          DNS & domain
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          Point your domain at the deployed Render service. Values here are for planning only until your control plane syncs them to Render.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-headline">Custom domain</label>
        <input
          type="text"
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value)}
          placeholder="app.example.com"
          className="mt-1 w-full max-w-md bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
        />
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-6 text-sm text-slate-300 space-y-3">
        <p className="font-headline text-cyan-200">Typical setup</p>
        <ul className="list-disc pl-5 space-y-2 text-slate-400">
          <li>
            <strong className="text-slate-300">Apex / root domain:</strong> use Render’s recommended ALIAS/ANAME or flattened CNAME to your service hostname (see Render dashboard for the exact target).
          </li>
          <li>
            <strong className="text-slate-300">Subdomain:</strong> add a <code className="text-cyan-300/90">CNAME</code> from your subdomain to the Render service hostname shown for this project.
          </li>
          <li>
            After DNS propagates, set <code className="text-cyan-300/90">PUBLIC_SITE_URL</code> on the Web Service to the final HTTPS origin and redeploy.
          </li>
        </ul>
      </div>
    </div>
  );
}

const SECRET_CATEGORY_OPTIONS: { value: SecretCategory; label: string }[] = [
  { value: 'api_key', label: 'API key' },
  { value: 'oauth_token', label: 'OAuth / token' },
  { value: 'variable', label: 'Variable' },
  { value: 'generic', label: 'Other' },
];

function ProjectSecretsEditor({ activeProjectKey }: { activeProjectKey: string }) {
  const [entries, setEntries] = useState<SecretEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    value: '',
    category: 'generic' as SecretCategory,
    note: '',
  });
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState({
    name: '',
    value: '',
    category: 'variable' as SecretCategory,
    note: '',
  });
  const [valueVisibleId, setValueVisibleId] = useState<string | null>(null);

  const persist = (next: SecretEntry[]) => {
    setEntries(next);
    saveProjectSecrets(activeProjectKey, next);
  };

  useEffect(() => {
    setEntries(loadProjectSecrets(activeProjectKey));
    setEditingId(null);
    setAdding(false);
    setValueVisibleId(null);
  }, [activeProjectKey]);

  const startEdit = (e: SecretEntry) => {
    setEditingId(e.id);
    setDraft({
      name: e.name,
      value: e.value,
      category: e.category,
      note: e.note || '',
    });
    setValueVisibleId(null);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const name = draft.name.trim();
    if (!name) return;
    persist(
      entries.map((x) =>
        x.id === editingId
          ? {
              ...x,
              name,
              value: draft.value,
              category: draft.category,
              note: draft.note.trim() || undefined,
            }
          : x,
      ),
    );
    setEditingId(null);
  };

  const removeOne = (id: string) => {
    if (!window.confirm('Delete this secret or variable?')) return;
    persist(entries.filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
    if (valueVisibleId === id) setValueVisibleId(null);
  };

  const addNew = () => {
    const name = addDraft.name.trim();
    if (!name) return;
    persist([
      ...entries,
      {
        id: newSecretId(),
        name,
        value: addDraft.value,
        category: addDraft.category,
        note: addDraft.note.trim() || undefined,
      },
    ]);
    setAddDraft({ name: '', value: '', category: 'variable', note: '' });
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h4 className="text-sm font-headline text-emerald-200 mb-1">Secrets, keys & variables</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Per project (<span className="font-mono text-cyan-500/80">{activeProjectKey}</span>). Add, edit, or remove
            entries. Values are stored in <strong className="text-slate-400">this browser only</strong> (localStorage)—mirror
            to Render env for production.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg text-xs font-headline border border-emerald-500/35 text-emerald-200 hover:bg-emerald-500/15"
          >
            <Plus className="w-3.5 h-3.5" />
            Add entry
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-headline text-cyan-300 uppercase tracking-wider">New entry</span>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddDraft({ name: '', value: '', category: 'variable', note: '' });
              }}
              className="p-1 rounded text-slate-500 hover:text-slate-300"
              aria-label="Cancel add"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-headline">Name / key</label>
              <input
                value={addDraft.name}
                onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. STRIPE_SECRET_KEY"
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase text-slate-500 font-headline">Type</label>
              <select
                value={addDraft.category}
                onChange={(e) =>
                  setAddDraft((d) => ({ ...d, category: e.target.value as SecretCategory }))
                }
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
              >
                {SECRET_CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase text-slate-500 font-headline">Value</label>
            <input
              type="password"
              autoComplete="off"
              value={addDraft.value}
              onChange={(e) => setAddDraft((d) => ({ ...d, value: e.target.value }))}
              placeholder="Token, secret, or variable value"
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-cyan-500/40 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-slate-500 font-headline">Note (optional)</label>
            <input
              value={addDraft.note}
              onChange={(e) => setAddDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Where this is used"
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddDraft({ name: '', value: '', category: 'variable', note: '' });
              }}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addNew}
              disabled={!addDraft.name.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-headline bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40"
            >
              Save entry
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && !adding ? (
        <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-white/10 rounded-lg">
          No custom secrets yet. Use <strong className="text-slate-400">Add entry</strong> for API keys, tokens, or env-style variables.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg border border-white/10 bg-black/25 overflow-hidden">
              {editingId === e.id ? (
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-headline">Name / key</label>
                      <input
                        value={draft.name}
                        onChange={(ev) => setDraft((d) => ({ ...d, name: ev.target.value }))}
                        className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono outline-none focus:border-cyan-500/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-slate-500 font-headline">Type</label>
                      <select
                        value={draft.category}
                        onChange={(ev) =>
                          setDraft((d) => ({ ...d, category: ev.target.value as SecretCategory }))
                        }
                        className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/40"
                      >
                        {SECRET_CATEGORY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 font-headline">Value</label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={draft.value}
                      onChange={(ev) => setDraft((d) => ({ ...d, value: ev.target.value }))}
                      className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono outline-none focus:border-cyan-500/40"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 font-headline">Note</label>
                    <input
                      value={draft.note}
                      onChange={(ev) => setDraft((d) => ({ ...d, note: ev.target.value }))}
                      className="mt-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/40"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={!draft.name.trim()}
                      className="px-4 py-1.5 rounded-lg text-xs font-headline bg-cyan-500/20 text-cyan-200 border border-cyan-500/35 hover:bg-cyan-500/30 disabled:opacity-40"
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-mono text-slate-200 truncate">{e.name}</span>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded border border-white/10 text-slate-500 font-headline">
                        {SECRET_CATEGORY_OPTIONS.find((c) => c.value === e.category)?.label ?? e.category}
                      </span>
                    </div>
                    {e.note ? <p className="text-[11px] text-slate-500 mt-1 truncate">{e.note}</p> : null}
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="text-[11px] text-slate-500 font-mono break-all">
                        {valueVisibleId === e.id ? e.value || '(empty)' : e.value ? '•'.repeat(Math.min(12, e.value.length)) + (e.value.length > 12 ? '…' : '') : '(empty)'}
                      </code>
                      {e.value ? (
                        <button
                          type="button"
                          onClick={() => setValueVisibleId((id) => (id === e.id ? null : e.id))}
                          className="text-[10px] text-cyan-500/90 hover:text-cyan-300 font-headline shrink-0"
                        >
                          {valueVisibleId === e.id ? 'Hide' : 'Reveal'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(e)}
                      className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-cyan-200 hover:border-cyan-500/30"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOne(e.id)}
                      className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/25"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SecretsTab({ activeProjectKey }: { activeProjectKey: string }) {
  const [grokKeyInput, setGrokKeyInput] = useState('');
  const [grokSavedFlash, setGrokSavedFlash] = useState(false);
  const [copiedChecklist, setCopiedChecklist] = useState(false);

  useEffect(() => {
    try {
      setGrokKeyInput(localStorage.getItem(NEBULLA_GROK_KEY_STORAGE) || '');
    } catch {
      /* ignore */
    }
  }, []);

  const saveGrokKey = () => {
    const v = grokKeyInput.trim();
    if (v) {
      localStorage.setItem(NEBULLA_GROK_KEY_STORAGE, v);
    } else {
      localStorage.removeItem(NEBULLA_GROK_KEY_STORAGE);
    }
    setGrokSavedFlash(true);
    window.setTimeout(() => setGrokSavedFlash(false), 2000);
  };

  const environmentChecklist = [
    '## 1. Platform variables',
    '- GROK_API_KEY',
    '- GROK_TTS_NEW_API_KEY',
    '- GROK_3_API_KEY',
    '- PENCIL_API_KEY',
    '- Optional: PENCIL_API_URL, GROK_B_MODEL',
    '',
    '## 2. Variables from Render',
    '- DATABASE_URL (from Render PostgreSQL connection string)',
    '- PUBLIC_SITE_URL (Render service public HTTPS URL)',
    '',
    '## 3. User additional secrets',
    '- Mirror every Secrets and Integrations value to Render env for this project',
    '- Sync on create and every update (idempotent)',
    '- Runtime source of truth is Render env',
  ].join('\n');

  const copyChecklist = async () => {
    try {
      await navigator.clipboard.writeText(environmentChecklist);
      setCopiedChecklist(true);
      window.setTimeout(() => setCopiedChecklist(false), 2000);
    } catch {
      setCopiedChecklist(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-xl font-headline text-cyan-300 mb-1">Secrets and Integrations</h3>
        <p className="text-sm text-slate-500 mb-6">Manage API keys, environment variables, and third-party connections.</p>
      </div>

      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-6">
        <h4 className="text-sm font-headline text-cyan-200 mb-1">Grok (xAI) API key</h4>
        <p className="text-xs text-slate-500 mb-4">
          Used for the assistant chat. Prefer setting <code className="text-cyan-400/90">GROK_API_KEY</code> in{' '}
          <code className="text-cyan-400/90">.env</code> and restarting the server. If you cannot use{' '}
          <code className="text-cyan-400/90">.env</code>, save your key here (stored only in this browser).
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="password"
            autoComplete="off"
            value={grokKeyInput}
            onChange={(e) => setGrokKeyInput(e.target.value)}
            placeholder="xai-..."
            className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm flex-1 text-slate-300 focus:border-cyan-500/50 outline-none font-mono"
          />
          <button
            type="button"
            onClick={saveGrokKey}
            className="px-5 py-2 bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 rounded-lg hover:bg-cyan-500/25 transition-colors text-sm font-headline shrink-0 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {grokSavedFlash ? 'Saved' : 'Save key'}
          </button>
        </div>
      </div>

      <ProjectSecretsEditor activeProjectKey={activeProjectKey} />

      {/* Environment Setup Canonical Checklist */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h4 className="text-sm font-headline text-slate-200 mb-1">Environment Setup Checklist</h4>
            <p className="text-xs text-slate-500">
              Canonical source: <code className="text-slate-400">environment-setup.md</code>. Keep Render env in sync with this page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyChecklist()}
            className="px-3 py-1.5 rounded-lg text-xs font-headline border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 transition-colors shrink-0"
          >
            {copiedChecklist ? 'Copied' : 'Copy checklist'}
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h5 className="text-xs font-headline text-cyan-300 uppercase tracking-wider mb-2">1. Platform variables</h5>
            <div className="space-y-2">
              {[
                ['GROK_API_KEY', 'Grok 4 primary brain'],
                ['GROK_TTS_NEW_API_KEY', 'Grok TTS (new API)'],
                ['GROK_3_API_KEY', 'Grok B writer model'],
                ['PENCIL_API_KEY', 'Nebula UI Studio mockups API'],
              ].map(([name, role]) => (
                <div key={name} className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-500 text-lg">key</span>
                    <span className="text-sm text-slate-300 font-mono">{name}</span>
                  </div>
                  <span className="text-xs text-slate-500">{role}</span>
                </div>
              ))}
              <div className="text-[11px] text-slate-500 leading-relaxed pt-1">
                Optional only when needed: <code className="text-slate-400">PENCIL_API_URL</code>, <code className="text-slate-400">GROK_B_MODEL</code>.
              </div>
            </div>
          </div>

          <div>
            <h5 className="text-xs font-headline text-cyan-300 uppercase tracking-wider mb-2">2. Variables from Render</h5>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-500 text-lg">database</span>
                  <span className="text-sm text-slate-300 font-mono">DATABASE_URL</span>
                </div>
                <span className="text-xs text-slate-500">Render PostgreSQL connection string</span>
              </div>
              <div className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-black/20">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-slate-500 text-lg">public</span>
                  <span className="text-sm text-slate-300 font-mono">PUBLIC_SITE_URL</span>
                </div>
                <span className="text-xs text-slate-500">Render public HTTPS origin</span>
              </div>
            </div>
          </div>

          <div className="p-4 border border-cyan-500/20 rounded-lg bg-cyan-500/5">
            <h5 className="text-xs font-headline text-cyan-300 uppercase tracking-wider mb-2">3. User additional secrets</h5>
            <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
              <li>- Every key/token added in this page must be mirrored to the same project on Render env.</li>
              <li>- Sync must run on create and every update/remove (idempotent behavior).</li>
              <li>- Production runtime reads Render env as source of truth.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Auth integration */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h4 className="text-sm font-headline text-slate-200 mb-2">Access mode</h4>
        <p className="text-xs text-slate-500 mb-4">
          Authentication is currently disabled. The workspace opens directly with no login required.
        </p>
        <div className="p-4 border border-white/10 rounded-lg bg-white/5">
          <h5 className="text-xs font-headline text-slate-300 mb-2 uppercase tracking-wider">Server environment</h5>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            On Render, set <code className="text-cyan-500/80">DATABASE_URL</code>,{' '}
            <code className="text-cyan-500/80">RENDER_API_KEY</code>, and{' '}
            <code className="text-cyan-500/80">PUBLIC_SITE_URL</code>.
          </p>
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
