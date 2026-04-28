import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, FolderGit2, FolderOpen, RefreshCw } from 'lucide-react';
import { readResponseJson } from '../lib/apiFetch';

type Overview = {
  nebulaProjectRoot: string;
  nebulaFiles: { relativePath: string; size: number; mtimeMs: number }[];
  git: { branch: string; entries: { status: string; path: string }[]; error?: string } | null;
  workspaceScaffold?: {
    rootRelative: string;
    recentlyCreated: string[];
    files: { relativePath: string; size: number; mtimeMs: number }[];
  };
};

const PREVIEW_MAX_BYTES = 96 * 1024;
type FileMeta = { size: number; mtimeMs: number; status?: string };
type TreeNode = { name: string; path: string; children: TreeNode[]; isFile: boolean };

function statusLabel(status: string): string {
  const s = status.replace(/\s/g, '');
  if (s.includes('?')) return 'Untracked';
  if (s === 'M' || s === 'MM' || status.includes('M')) return 'Modified';
  if (s.includes('A')) return 'Added';
  if (s.includes('D')) return 'Deleted';
  if (s.includes('R')) return 'Renamed';
  return 'Changed';
}

function statusTone(status: string): string {
  const u = statusLabel(status);
  if (u === 'Untracked') return 'text-amber-300/90';
  if (u === 'Added') return 'text-emerald-300/90';
  if (u === 'Deleted') return 'text-red-300/90';
  if (u === 'Modified') return 'text-cyan-300/90';
  return 'text-slate-400';
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [], isFile: false };
  const byPath = new Map<string, TreeNode>();
  byPath.set('', root);

  const sorted = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  for (const fullPath of sorted) {
    const clean = fullPath.replace(/^\/+|\/+$/g, '');
    if (!clean) continue;
    const parts = clean.split('/').filter(Boolean);
    let acc = '';
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = byPath.get(acc);
      if (!node) {
        node = { name: part, path: acc, children: [], isFile };
        byPath.set(acc, node);
        parent.children.push(node);
      } else if (isFile) {
        node.isFile = true;
      }
      parent = node;
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root.children);
  return root.children;
}

export function SourceControlPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/source-control/overview');
      const j = await readResponseJson<Overview & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`);
      }
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load source control');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener('nebula-master-plan-updated', onRefresh);
    return () => window.removeEventListener('nebula-master-plan-updated', onRefresh);
  }, [load]);

  const openPreview = async (relativePath: string, size: number) => {
    setSelectedPath(relativePath);
    if (size > PREVIEW_MAX_BYTES) {
      setPreview(
        `[Preview skipped: file is ${(size / 1024).toFixed(0)} KB — open locally or raise limit (max ${PREVIEW_MAX_BYTES / 1024} KB in browser).]`,
      );
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(relativePath)}`);
      const j = await readResponseJson<{ content?: string; error?: string }>(res);
      if (!res.ok) {
        throw new Error(typeof j.error === 'string' ? j.error : 'Read failed');
      }
      setPreview(typeof j.content === 'string' ? j.content : '');
    } catch (e) {
      setPreview(e instanceof Error ? e.message : 'Could not read file');
    } finally {
      setPreviewLoading(false);
    }
  };

  const fmtTime = (ms: number) => {
    try {
      return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  };

  const scaffoldSet = new Set((data?.workspaceScaffold?.files ?? []).map((f) => f.relativePath));
  const nebulaFilesOutsideScaffold =
    data?.nebulaFiles.filter((f) => !scaffoldSet.has(f.relativePath)) ?? [];
  const workspaceFiles = data?.workspaceScaffold?.files ?? [];
  const workspaceMeta = new Map(workspaceFiles.map((f) => [f.relativePath, { size: f.size, mtimeMs: f.mtimeMs } as FileMeta]));
  const nebulaMeta = new Map(nebulaFilesOutsideScaffold.map((f) => [f.relativePath, { size: f.size, mtimeMs: f.mtimeMs } as FileMeta]));
  const gitMeta = new Map((data?.git?.entries ?? []).map((e) => [e.path, { size: 0, mtimeMs: 0, status: e.status } as FileMeta]));
  const workspaceTree = buildTree(workspaceFiles.map((f) => f.relativePath));
  const gitTree = buildTree((data?.git?.entries ?? []).map((e) => e.path));
  const nebulaTree = buildTree(nebulaFilesOutsideScaffold.map((f) => f.relativePath));

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderTree = (nodes: TreeNode[], meta: Map<string, FileMeta>, depth = 0) => (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        if (!node.isFile) {
          const expanded = expandedFolders[node.path] ?? depth < 1;
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => toggleFolder(node.path)}
                className="w-full text-left rounded-md px-2 py-1 flex gap-2 items-center hover:bg-white/5 border border-transparent"
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
                )}
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-cyan-300/80" aria-hidden />
                <span className="text-xs text-slate-300 truncate flex-1">{node.name}</span>
              </button>
              {expanded ? <div className="pl-4">{renderTree(node.children, meta, depth + 1)}</div> : null}
            </li>
          );
        }
        const m = meta.get(node.path);
        const status = m?.status;
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => void openPreview(node.path, m?.size ?? 0)}
              className={`w-full text-left rounded-md px-2 py-1 flex gap-2 items-center hover:bg-white/5 ${
                selectedPath === node.path ? 'bg-cyan-500/10 border border-cyan-500/20' : 'border border-transparent'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 shrink-0 text-slate-500" aria-hidden />
              <span className="text-xs text-slate-300 truncate flex-1 font-mono">{node.name}</span>
              {status ? (
                <span className={`text-[10px] font-mono shrink-0 ${statusTone(status)}`} title={statusLabel(status)}>
                  {status}
                </span>
              ) : (
                <span className="text-[10px] text-slate-600 shrink-0 tabular-nums" title={m?.mtimeMs ? fmtTime(m.mtimeMs) : ''}>
                  {typeof m?.size === 'number' ? `${m.size} B` : ''}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-[#040f1a]/40 border border-white/5 rounded-lg overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-cyan-200">
          <FolderGit2 className="w-5 h-5 shrink-0" aria-hidden />
          <div>
            <h2 className="text-sm font-headline tracking-wide">Source control</h2>
            <p className="text-[10px] text-slate-500 font-mono">
              Git changes + files under <span className="text-cyan-500/80">{data?.nebulaProjectRoot ?? 'nebula-project'}</span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-500/35 hover:bg-cyan-500/10 hover:text-cyan-100 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </div>

      {err ? (
        <div className="p-4 text-sm text-red-300/90 border-b border-red-500/20 bg-red-950/20">{err}</div>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="min-h-0 lg:w-[42%] lg:max-w-md flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-6">
            {loading && !data ? (
              <p className="text-xs text-slate-500">Loading repository state…</p>
            ) : null}

            {data?.workspaceScaffold?.files?.length ? (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">
                  Default workspace ·{' '}
                  <span className="text-cyan-400/90 font-mono">{data.workspaceScaffold.rootRelative}</span>
                </h3>
                {data.workspaceScaffold.recentlyCreated.length ? (
                  <p className="text-[10px] text-emerald-400/90 mb-2">
                    Added {data.workspaceScaffold.recentlyCreated.length} empty or minimal default path(s).
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 mb-2">
                    index.html, package.json, vite.config.ts, server.ts, SKILL.md, src/, pages/, packages/, .env
                  </p>
                )}
                {renderTree(workspaceTree, workspaceMeta)}
              </section>
            ) : null}

            {data?.git ? (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">
                  Git · branch <span className="text-cyan-400/90">{data.git.branch}</span>
                </h3>
                {data.git.error ? (
                  <p className="text-xs text-amber-300/90">{data.git.error}</p>
                ) : data.git.entries.length === 0 ? (
                  <p className="text-xs text-slate-500">Working tree clean — no local changes.</p>
                ) : (
                  renderTree(gitTree, gitMeta)
                )}
              </section>
            ) : (
              <section>
                <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">Git</h3>
                <p className="text-xs text-slate-500">
                  No <code className="text-cyan-500/80">.git</code> folder in this workspace — showing Nebula project files only.
                </p>
              </section>
            )}

            <section>
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 font-headline mb-2">
                Nebula project files ({nebulaFilesOutsideScaffold.length})
                {scaffoldSet.size ? (
                  <span className="text-slate-600 font-normal normal-case"> · scaffold listed above</span>
                ) : null}
              </h3>
              {!nebulaFilesOutsideScaffold.length ? (
                <p className="text-xs text-slate-500">No other files under project docs root yet.</p>
              ) : (
                renderTree(nebulaTree, nebulaMeta)
              )}
            </section>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col bg-[#0a1628]/75">
          <div className="shrink-0 px-3 py-2 border-b border-white/10 text-[10px] text-slate-500 font-mono truncate">
            {selectedPath ? selectedPath : 'Select a file to preview'}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            {previewLoading ? (
              <p className="text-xs text-slate-500">Reading file…</p>
            ) : preview !== null ? (
              <pre className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap font-mono break-words">
                {preview}
              </pre>
            ) : (
              <p className="text-xs text-slate-600">
                Click a path under Git changes or Nebula project files to load contents from the server (read-only).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
