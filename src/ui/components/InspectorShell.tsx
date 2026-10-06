import React, { useCallback } from 'react'
import type { GraphNode, NodeDef, NodeGraph } from '../../core/types.js'
import { NodeErrorBoundary } from './ErrorBoundary.js'

export interface InspectorShellProps {
  /** Selected node (null = nothing selected) */
  node: GraphNode | null
  /** Prototype of the selected node */
  def: NodeDef | null
  /** Graph (for context) */
  graph: NodeGraph
  /** Callback for updating node */
  onUpdateNode: (id: string, updates: Partial<GraphNode>) => void
  /** Callback for updating node data */
  onUpdateData: (id: string, data: Record<string, unknown>) => void
  /** Callback for deleting node */
  onDeleteNode: (id: string) => void
}

export function InspectorShell({
  node, def, graph, onUpdateNode, onUpdateData, onDeleteNode,
}: InspectorShellProps) {
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!node) return
    onUpdateNode(node.id, { name: e.target.value })
  }, [node, onUpdateNode])

  const handleDataChange = useCallback((data: Record<string, unknown>) => {
    if (!node) return
    onUpdateData(node.id, data)
  }, [node, onUpdateData])

  const handleDelete = useCallback(() => {
    if (!node) return
    onDeleteNode(node.id)
  }, [node, onDeleteNode])

  if (!node || !def) {
    return (
      <div className="nn-inspector nn-inspector-empty">
        <span>Select a node</span>
      </div>
    )
  }

  return (
    <div className="nn-inspector">
      {/* Header */}
      <div className="nn-inspector-header">
        <span className="nn-inspector-icon">{def.icon}</span>
        <span className="nn-inspector-type">{def.displayName}</span>
        <button className="nn-inspector-delete" onClick={handleDelete} title="Delete node">
          ✕
        </button>
      </div>

      {/* Name */}
      <div className="nn-inspector-field">
        <label className="nn-inspector-label">Name</label>
        <input
          className="nn-inspector-input"
          value={node.name || ''}
          onChange={handleNameChange}
          placeholder={def.displayName}
        />
      </div>

      {/* Custom inspector */}
      <NodeErrorBoundary>
        {def.inspectorComponent
          ? React.createElement(def.inspectorComponent, {
              node,
              def,
              graph,
              onChange: handleDataChange,
            })
          : (
            <div className="nn-inspector-json">
              <pre>{JSON.stringify(node.data, null, 2)}</pre>
            </div>
          )}
      </NodeErrorBoundary>

      {/* Metadata */}
      <div className="nn-inspector-meta">
        <div className="nn-inspector-meta-row">
          <span>ID:</span> <code>{node.id}</code>
        </div>
        <div className="nn-inspector-meta-row">
          <span>Type:</span> <code>{node.type}</code>
        </div>
        <div className="nn-inspector-meta-row">
          <span>Pos:</span> <code>{Math.round(node.position.x)}, {Math.round(node.position.y)}</code>
        </div>
      </div>
    </div>
  )
}
