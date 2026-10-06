import React, { useCallback, useRef, useEffect } from 'react'
import type { GraphNode, NodeDef, PortDef, NodeGraph } from '../../core/types.js'
import { PortView } from './PortView.js'
import { NodeErrorBoundary } from './ErrorBoundary.js'

export interface NodeViewProps {
  node: GraphNode
  def: NodeDef
  graph: NodeGraph
  selected?: boolean
  onSelect?: (id: string) => void
  onDragStart?: (id: string, startX: number, startY: number) => void
  onPortDragStart?: (nodeId: string, portId: string, direction: 'in' | 'out') => void
  onPortDragEnd?: (nodeId: string, portId: string) => void
  /** Which ports have connections */
  connectedPorts?: Set<string>
  /** Custom body render */
  renderBody?: (node: GraphNode, def: NodeDef) => React.ReactNode
  /** Custom preview render */
  renderPreview?: (node: GraphNode, def: NodeDef) => React.ReactNode
  /** Port position callback for connection drawing */
  onPortPosition?: (nodeId: string, portId: string, x: number, y: number) => void
}

export function NodeView({
  node, def, graph, selected, onSelect, onDragStart,
  onPortDragStart, onPortDragEnd, connectedPorts,
  renderBody, renderPreview, onPortPosition,
}: NodeViewProps) {
  const nodeRef = useRef<HTMLDivElement>(null)

  const allPorts = getAllPorts(def, node.data)
  const inputPorts = allPorts.filter(p => p.direction === 'in')
  const outputPorts = allPorts.filter(p => p.direction === 'out')

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.nn-port-circle')) return
    if (e.button !== 0) return // middle button pans the canvas
    e.stopPropagation()
    onSelect?.(node.id)
    onDragStart?.(node.id, e.clientX, e.clientY)
  }, [node.id, onSelect, onDragStart])

  // Report port positions after render
  useEffect(() => {
    if (!nodeRef.current || !onPortPosition) return
    const circles = nodeRef.current.querySelectorAll<HTMLElement>('.nn-port-circle')
    circles.forEach(el => {
      const rect = el.getBoundingClientRect()
      const nid = el.dataset.nodeId!
      const pid = el.dataset.portId!
      onPortPosition(nid, pid, rect.left + rect.width / 2, rect.top + rect.height / 2)
    })
  })

  const style: React.CSSProperties = {
    transform: `translate(${node.position.x}px, ${node.position.y}px)`,
  }

  const headerStyle: React.CSSProperties = def.color ? { backgroundColor: def.color } : {}

  return (
    <div
      ref={nodeRef}
      className={`nn-node ${selected ? 'nn-node-selected' : ''}`}
      style={style}
      onMouseDown={handleMouseDown}
      data-node-id={node.id}
    >
      {/* Header */}
      <div className="nn-node-header" style={headerStyle}>
        {def.icon && <span className="nn-node-icon">{def.icon}</span>}
        <span className="nn-node-name">{node.name || def.displayName}</span>
      </div>

      {/* Ports + Body */}
      <div className="nn-node-content">
        {inputPorts.length > 0 && (
          <div className="nn-ports nn-ports-in">
            {inputPorts.map(p => (
              <PortView
                key={p.id}
                port={p}
                nodeId={node.id}
                onDragStart={onPortDragStart}
                onDragEnd={onPortDragEnd}
                connected={connectedPorts?.has(p.id)}
              />
            ))}
          </div>
        )}

        {outputPorts.length > 0 && (
          <div className="nn-ports nn-ports-out">
            {outputPorts.map(p => (
              <PortView
                key={p.id}
                port={p}
                nodeId={node.id}
                onDragStart={onPortDragStart}
                onDragEnd={onPortDragEnd}
                connected={connectedPorts?.has(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Custom body */}
      {(renderBody || def.bodyComponent) && (
        <div className="nn-node-body">
          <NodeErrorBoundary>
            {renderBody
              ? renderBody(node, def)
              : def.bodyComponent
                ? React.createElement(def.bodyComponent, { node, def, graph })
                : null}
          </NodeErrorBoundary>
        </div>
      )}

      {/* Preview */}
      {renderPreview && (
        <div className="nn-node-preview">
          <NodeErrorBoundary>
            {renderPreview(node, def)}
          </NodeErrorBoundary>
        </div>
      )}
    </div>
  )
}

function getAllPorts(def: NodeDef, data: Record<string, unknown>): PortDef[] {
  const ports = [...def.ports]
  if (def.dynamicPorts) {
    ports.push(...def.dynamicPorts(data))
  }
  return ports
}
