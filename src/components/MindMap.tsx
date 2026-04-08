import React, { useState, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { Link, Trash2, Plus, AlertTriangle } from 'lucide-react';

// Custom Node Component
const PageNode = ({ data, id }: any) => {
  return (
    <div className="px-4 py-2 shadow-lg rounded-md bg-[#040f1a] border border-cyan-500/30 min-w-[150px] relative group">
      <Handle type="target" position={Position.Left} className="w-2 h-2 bg-cyan-400" />
      <div className="flex justify-between items-center gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-headline text-cyan-300">{data.label}</span>
          {data.isCreated ? (
            <a href={`#${data.label.toLowerCase().replace(/\s+/g, '-')}`} className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1">
              <Link className="w-3 h-3" />
              Live Link
            </a>
          ) : (
            <span className="text-[10px] text-slate-500">Pending Creation</span>
          )}
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); data.onDelete(id); }}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 bg-cyan-400" />
    </div>
  );
};

const nodeTypes = { pageNode: PageNode };

export function MindMap({ pages, setPages, edges, setEdges, onSaveToMasterPlan }: any) {
  const [nodeToDelete, setNodeToDelete] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [showConnectConfirm, setShowConnectConfirm] = useState(false);
  
  const [edgeToDelete, setEdgeToDelete] = useState<string | null>(null);
  const [showEdgeDeleteConfirm, setShowEdgeDeleteConfirm] = useState(false);

  const handleDeleteRequest = useCallback((id: string) => {
    setNodeToDelete(id);
    setShowDeleteConfirm(true);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removeChanges = changes.filter(c => c.type === 'remove');
      if (removeChanges.length > 0) {
        // @ts-ignore
        handleDeleteRequest(removeChanges[0].id);
        const otherChanges = changes.filter(c => c.type !== 'remove');
        if (otherChanges.length > 0) {
          setPages((nds: Node[]) => applyNodeChanges(otherChanges, nds));
        }
        return;
      }
      
      setPages((nds: Node[]) => applyNodeChanges(changes, nds));
      
      const isDragStop = changes.some(c => c.type === 'position' && !c.dragging);
      if (isDragStop) {
        onSaveToMasterPlan();
      }
    },
    [setPages, handleDeleteRequest, onSaveToMasterPlan]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removeChanges = changes.filter(c => c.type === 'remove');
      if (removeChanges.length > 0) {
        // @ts-ignore
        setEdgeToDelete(removeChanges[0].id);
        setShowEdgeDeleteConfirm(true);
        const otherChanges = changes.filter(c => c.type !== 'remove');
        if (otherChanges.length > 0) {
          setEdges((eds: Edge[]) => applyEdgeChanges(otherChanges, eds));
        }
        return;
      }
      setEdges((eds: Edge[]) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setPendingConnection(params);
      setShowConnectConfirm(true);
    },
    []
  );

  const confirmConnect = () => {
    if (pendingConnection) {
      setEdges((eds: Edge[]) => addEdge({ ...pendingConnection, animated: true, style: { stroke: '#00ffff' } }, eds));
      onSaveToMasterPlan();
    }
    setShowConnectConfirm(false);
    setPendingConnection(null);
  };

  const cancelConnect = () => {
    setShowConnectConfirm(false);
    setPendingConnection(null);
  };

  const confirmEdgeDelete = () => {
    if (edgeToDelete) {
      setEdges((eds: Edge[]) => eds.filter(e => e.id !== edgeToDelete));
      onSaveToMasterPlan();
    }
    setShowEdgeDeleteConfirm(false);
    setEdgeToDelete(null);
  };

  const cancelEdgeDelete = () => {
    setShowEdgeDeleteConfirm(false);
    setEdgeToDelete(null);
  };

  const confirmDelete = () => {
    if (nodeToDelete) {
      setPages((nds: Node[]) => nds.filter(n => n.id !== nodeToDelete));
      setEdges((eds: Edge[]) => eds.filter(e => e.source !== nodeToDelete && e.target !== nodeToDelete));
      onSaveToMasterPlan();
    }
    setShowDeleteConfirm(false);
    setNodeToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setNodeToDelete(null);
  };

  const handleAddNode = () => {
    if (!newPageName.trim()) return;
    const newNode: Node = {
      id: uuidv4(),
      type: 'pageNode',
      position: { x: Math.random() * 200 + 800, y: 250 + (Math.random() * 100 - 50) },
      data: { 
        label: newPageName, 
        isCritical: false, 
        isCreated: false, 
        description: 'New page added via Mind Map.',
        onDelete: handleDeleteRequest
      }
    };
    setPages((nds: Node[]) => [...nds, newNode]);
    setNewPageName('');
    setShowAddModal(false);
    onSaveToMasterPlan();
  };

  // Inject onDelete into node data
  const nodesWithCallbacks = pages.map((node: Node) => ({
    ...node,
    data: { ...node.data, onDelete: handleDeleteRequest }
  }));

  const nodeToDeleteData = pages.find((n: Node) => n.id === nodeToDelete);

  return (
    <div className="w-full h-full relative bg-[#020810] rounded-md overflow-hidden border border-white/5 shadow-2xl">
      <ReactFlow
        nodes={nodesWithCallbacks}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-transparent"
        colorMode="dark"
      >
        <Background color="#00ffff" gap={16} size={1} />
        <Controls className="bg-[#040f1a] border border-white/10 fill-cyan-300 text-cyan-300" />
        <Panel position="top-left" className="m-4">
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 rounded-md text-13 font-headline hover:bg-cyan-500/20 transition-all shadow-[0_0_10px_rgba(0,255,255,0.1)]"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Page
          </button>
        </Panel>
      </ReactFlow>

      {/* Connect Edge Confirm Modal */}
      {showConnectConfirm && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-white/10 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-headline text-cyan-300 mb-2">Connect Pages?</h3>
            <p className="text-13 text-slate-300 mb-6">Are you sure you want to connect these pages? This will update the application's architecture and navigation flow.</p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelConnect} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={confirmConnect} className="px-4 py-2 rounded text-13 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors">Yes, Connect</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Edge Confirm Modal */}
      {showEdgeDeleteConfirm && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-red-500/30 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-headline text-red-400">Delete Connection?</h3>
            </div>
            <p className="text-13 text-slate-300 mb-6">Are you sure you want to remove this connection? This will impact the application's routing and architecture.</p>
            <div className="flex justify-end gap-3">
              <button onClick={cancelEdgeDelete} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={confirmEdgeDelete} className="px-4 py-2 rounded text-13 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">Delete Connection</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && nodeToDeleteData && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-red-500/30 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="text-lg font-headline text-red-400">Delete Page?</h3>
            </div>
            <p className="text-13 text-slate-300 mb-4">
              You are about to delete <strong>{nodeToDeleteData.data.label}</strong>.
            </p>
            {nodeToDeleteData.data.isCritical && (
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-12 text-red-200 mb-6">
                <strong>CRITICAL PAGE WARNING:</strong> Deleting this page will severely impact the application's architecture. It may break routing, authentication flows, or core data relationships. Proceed with extreme caution.
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={cancelDelete} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded text-13 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">Delete Page</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Page Modal */}
      {showAddModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#040f1a] border border-white/10 p-6 rounded-lg shadow-2xl max-w-sm w-full">
            <h3 className="text-lg font-headline text-cyan-300 mb-4">Add New Page</h3>
            <input 
              type="text" 
              value={newPageName}
              onChange={e => setNewPageName(e.target.value)}
              placeholder="Page Name (e.g., User Profile)"
              className="w-full bg-black/30 border border-white/10 rounded px-3 py-2 text-13 text-white focus:outline-none focus:border-cyan-500/50 mb-6"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAddNode()}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded text-13 text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleAddNode} className="px-4 py-2 rounded text-13 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors">Add Page</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
