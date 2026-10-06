import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { NodeGraph, NodeDef, GraphNode, PortRef, Position, PortDef, ViewState } from '../../core/types.js'
import type { NodeRegistry } from '../../core/registry.js'
import { NodeView } from './NodeView.js'
import { ConnectionView } from './ConnectionView.js'
import { ConnectionPreview } from './ConnectionPreview.js'

export interface CanvasProps {
  graph: NodeGraph
  registry: NodeRegistry
  selectedNodes: string[]
  selectedConnections: string[]
  onNodeSelect?: (ids: string[]) => void
  onNodeMove?: (id: string, position: Position) => void
  onNodeDelete?: (ids: string[]) => void
  onConnectionCreate?: (from: PortRef, to: PortRef) => void
  onConnectionDelete?: (ids: string[]) => void
  onCanvasClick?: () => void
  onConnectionSelect?: (id: string) => void
  renderNodeBody?: (node: GraphNode, def: NodeDef) => React.ReactNode
  renderNodePreview?: (node: GraphNode, def: NodeDef) => React.ReactNode
  readonly?: boolean
}

interface DragState {
  type: 'node' | 'pan'
  nodeId?: string
  startX: number
  startY: number
  startNodePos?: Position
}

interface ConnectingState {
  fromNode: string
  fromPort: string
  fromDirection: 'in' | 'out'
  mouseX: number
  mouseY: number
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1

// Layout constants — must match CSS
const NODE_WIDTH = 160
const NODE_HEADER_H = 28
const PORT_ROW_H = 22
const PORT_Y_START = 6

/** Compute port position in canvas coordinates (relative to node position) */
function getPortPosition(
  node: GraphNode,
  portId: string,
  _def: NodeDef,
  allPorts: PortDef[],
): Position | null {
  const inPorts = allPorts.filter(p => p.direction === 'in')
  const outPorts = allPorts.filter(p => p.direction === 'out')

  let portIndex = -1
  let isOutput = false

  const inIdx = inPorts.findIndex(p => p.id === portId)
  if (inIdx >= 0) {
    portIndex = inIdx
    isOutput = false
  } else {
    const outIdx = outPorts.findIndex(p => p.id === portId)
    if (outIdx >= 0) {
      portIndex = outIdx
      isOutput = true
    }
  }

  if (portIndex < 0) return null

  const x = node.position.x + (isOutput ? NODE_WIDTH : 0)
  const y = node.position.y + NODE_HEADER_H + PORT_Y_START + portIndex * PORT_ROW_H + PORT_ROW_H / 2

  return { x, y }
}

function getAllPorts(def: NodeDef, data: Record<string, unknown>): PortDef[] {
  const ports = [...def.ports]
  if (def.dynamicPorts) {
    try { ports.push(...def.dynamicPorts(data)) } catch {}
  }
  return ports
}

export function Canvas({
  graph, registry, selectedNodes, selectedConnections,
  onNodeSelect, onNodeMove, onNodeDelete,
  onConnectionCreate, onConnectionDelete, onCanvasClick, onConnectionSelect,
  renderNodeBody, renderNodePreview, readonly,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ViewState>({ pan: { x: 0, y: 0 }, zoom: 1 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [connecting, setConnecting] = useState<ConnectingState | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)

  // Compute port position for a connection endpoint
  const getPortPos = useCallback((nodeId: string, portId: string): Position | null => {
    const node = graph.nodes.find(n => n.id === nodeId)
    if (!node) return null
    const def = registry.get(node.type)
    if (!def) return null
    const allPorts = getAllPorts(def, node.data)
    return getPortPosition(node, portId, def, allPorts)
  }, [graph.nodes, registry])

  // Connected ports per node
  const connectedPortSets = new Map<string, Set<string>>()
  for (const conn of graph.connections) {
    if (!connectedPortSets.has(conn.from.node)) connectedPortSets.set(conn.from.node, new Set())
    if (!connectedPortSets.has(conn.to.node)) connectedPortSets.set(conn.to.node, new Set())
    connectedPortSets.get(conn.from.node)!.add(conn.from.port)
    connectedPortSets.get(conn.to.node)!.add(conn.to.port)
  }

  // --- Find nearest port at mouse position (canvas coords) ---
  const findNearestPort = useCallback((canvasX: number, canvasY: number, excludeNode?: string, direction?: 'in' | 'out'): { nodeId: string; portId: string } | null => {
    let best: { nodeId: string; portId: string; dist: number } | null = null

    for (const node of graph.nodes) {
      if (excludeNode && node.id === excludeNode) continue
      const def = registry.get(node.type)
      if (!def) continue
      const allPorts = getAllPorts(def, node.data)

      for (const port of allPorts) {
        if (direction && port.direction !== direction) continue
        const pos = getPortPosition(node, port.id, def, allPorts)
        if (!pos) continue

        const dx = canvasX - pos.x
        const dy = canvasY - pos.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < 30 && (!best || dist < best.dist)) {
          best = { nodeId: node.id, portId: port.id, dist }
        }
      }
    }

    return best ? { nodeId: best.nodeId, portId: best.portId } : null
  }, [graph.nodes, registry])

  // Screen coords → canvas coords
  const screenToCanvas = useCallback((clientX: number, clientY: number): Position => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: clientX, y: clientY }
    return {
      x: (clientX - rect.left - view.pan.x) / view.zoom,
      y: (clientY - rect.top - view.pan.y) / view.zoom,
    }
  }, [view])

  // ---- Node drag ----
  const handleNodeDragStart = useCallback((nodeId: string, startX: number, startY: number) => {
    if (readonly) return
    const node = graph.nodes.find(n => n.id === nodeId)
    if (!node) return
    setDrag({ type: 'node', nodeId, startX, startY, startNodePos: { ...node.position } })
  }, [graph.nodes, readonly])

  // ---- Port drag (connection) ----
  const handlePortDragStart = useCallback((nodeId: string, portId: string, direction: 'in' | 'out') => {
    if (readonly) return
    const canvasPos = getPortPos(nodeId, portId)
    setConnecting({
      fromNode: nodeId,
      fromPort: portId,
      fromDirection: direction,
      mouseX: canvasPos?.x ?? 0,
      mouseY: canvasPos?.y ?? 0,
    })
  }, [readonly, getPortPos])

  // ---- Canvas mouse events ----
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      setDrag({ type: 'pan', startX: e.clientX - view.pan.x, startY: e.clientY - view.pan.y })
    } else if (e.button === 0) {
      if ((e.target as HTMLElement).closest('.nn-node')) return
      onCanvasClick?.()
    }
  }, [view.pan, spaceHeld, onCanvasClick])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (drag) {
        if (drag.type === 'pan') {
          setView(v => ({ ...v, pan: { x: e.clientX - drag.startX, y: e.clientY - drag.startY } }))
        } else if (drag.type === 'node' && drag.nodeId && drag.startNodePos) {
          const dx = (e.clientX - drag.startX) / view.zoom
          const dy = (e.clientY - drag.startY) / view.zoom
          onNodeMove?.(drag.nodeId, {
            x: Math.round(drag.startNodePos.x + dx),
            y: Math.round(drag.startNodePos.y + dy),
          })
        }
      }
      if (connecting && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setConnecting(c => c ? {
          ...c,
          mouseX: (e.clientX - rect.left - view.pan.x) / view.zoom,
          mouseY: (e.clientY - rect.top - view.pan.y) / view.zoom,
        } : null)
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      // Handle connection drop — find nearest port
      if (connecting) {
        const canvas = screenToCanvas(e.clientX, e.clientY)
        const targetDirection = connecting.fromDirection === 'out' ? 'in' : 'out'
        const target = findNearestPort(canvas.x, canvas.y, connecting.fromNode, targetDirection)

        if (target) {
          let from: PortRef, to: PortRef
          if (connecting.fromDirection === 'out') {
            from = { node: connecting.fromNode, port: connecting.fromPort }
            to = { node: target.nodeId, port: target.portId }
          } else {
            from = { node: target.nodeId, port: target.portId }
            to = { node: connecting.fromNode, port: connecting.fromPort }
          }
          onConnectionCreate?.(from, to)
        }
        setConnecting(null)
      }
      if (drag) setDrag(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [drag, connecting, view, onNodeMove, onConnectionCreate, screenToCanvas, findNearestPort])

  // ---- Zoom ----
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setView(v => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom + delta))
        if (newZoom === v.zoom) return v
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const scale = newZoom / v.zoom
        return {
          zoom: newZoom,
          pan: {
            x: mx - (mx - v.pan.x) * scale,
            y: my - (my - v.pan.y) * scale,
          },
        }
      })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // ---- Keyboard ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setSpaceHeld(true)
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && !readonly) {
        if (selectedNodes.length > 0) onNodeDelete?.(selectedNodes)
        if (selectedConnections.length > 0) {
          selectedConnections.forEach(id => onConnectionDelete?.([id]))
        }
      }
      if (e.code === 'Escape') {
        onCanvasClick?.()
        setConnecting(null)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedNodes, selectedConnections, readonly, onNodeDelete, onConnectionDelete, onCanvasClick])

  const zoomIn = () => setView(v => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom + ZOOM_STEP) }))
  const zoomOut = () => setView(v => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom - ZOOM_STEP) }))
  const zoomReset = () => setView({ pan: { x: 0, y: 0 }, zoom: 1 })

  // Render connections using computed positions
  const renderConnections = () => {
    return graph.connections.map(conn => {
      const fromPos = getPortPos(conn.from.node, conn.from.port)
      const toPos = getPortPos(conn.to.node, conn.to.port)
      if (!fromPos || !toPos) return null
      return (
        <ConnectionView
          key={conn.id}
          from={fromPos}
          to={toPos}
          selected={selectedConnections.includes(conn.id)}
          onClick={() => {
            onConnectionSelect?.(conn.id)
          }}
        />
      )
    })
  }

  // Render connection preview
  const renderConnectionPreview = () => {
    if (!connecting) return null
    const fromPos = getPortPos(connecting.fromNode, connecting.fromPort)
    if (!fromPos) return null
    const mousePos = { x: connecting.mouseX, y: connecting.mouseY }
    return connecting.fromDirection === 'out'
      ? <ConnectionPreview from={fromPos} to={mousePos} />
      : <ConnectionPreview from={mousePos} to={fromPos} />
  }

  return (
    <div
      ref={containerRef}
      className={`nn-canvas ${spaceHeld ? 'nn-canvas-panning' : ''} ${connecting ? 'nn-canvas-connecting' : ''}`}
      onMouseDown={handleMouseDown}
      tabIndex={0}
    >
      {/* Zoom controls */}
      <div className="nn-zoom-controls">
        <button onClick={zoomOut}>−</button>
        <button onClick={zoomReset}>{Math.round(view.zoom * 100)}%</button>
        <button onClick={zoomIn}>+</button>
      </div>

      {/* Transform layer */}
      <div
        className="nn-canvas-transform"
        style={{
          transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* SVG connections layer — use viewBox for proper sizing */}
        <svg className="nn-connections-layer" style={{ position: 'absolute', top: 0, left: 0, width: '10000px', height: '10000px', overflow: 'visible', pointerEvents: 'none' }}>
          {renderConnections()}
          {renderConnectionPreview()}
        </svg>

        {/* Nodes layer */}
        <div className="nn-nodes-layer">
          {graph.nodes.map(node => {
            const def = registry.get(node.type)
            if (!def) return null
            return (
              <NodeView
                key={node.id}
                node={node}
                def={def}
                graph={graph}
                selected={selectedNodes.includes(node.id)}
                onSelect={(id) => onNodeSelect?.([id])}
                onDragStart={handleNodeDragStart}
                onPortDragStart={handlePortDragStart}
                onPortDragEnd={() => {}}
                connectedPorts={connectedPortSets.get(node.id)}
                renderBody={renderNodeBody}
                renderPreview={renderNodePreview}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
