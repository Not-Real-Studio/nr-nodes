import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { NodeGraph, NodeDef, GraphNode, GraphGroup, PortRef, Position, PortDef, ViewState } from '../../core/types.js'
import type { NodeRegistry } from '../../core/registry.js'
import { DEFAULT_NODE_SIZE } from '../../core/layout.js'
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
  /** A drag of nodes (a node or a whole group) actually started moving. Use it to record one undo step. */
  onNodeMoveStart?: (ids: string[]) => void
  /** The drag that fired `onNodeMoveStart` ended. */
  onNodeMoveEnd?: (ids: string[]) => void
  onNodeDelete?: (ids: string[]) => void
  onConnectionCreate?: (from: PortRef, to: PortRef) => void
  onConnectionDelete?: (ids: string[]) => void
  onCanvasClick?: () => void
  onConnectionSelect?: (id: string) => void
  /** Cmd/Ctrl+Z while the canvas has focus */
  onUndo?: () => void
  /** Shift+Cmd/Ctrl+Z while the canvas has focus */
  onRedo?: () => void
  renderNodeBody?: (node: GraphNode, def: NodeDef) => React.ReactNode
  renderNodePreview?: (node: GraphNode, def: NodeDef) => React.ReactNode
  /** Initial pan/zoom. Default: pan {0,0}, zoom 1. */
  initialView?: ViewState
  readonly?: boolean
}

export interface CanvasHandle {
  /** Fit all nodes (and group frames) into the visible area. */
  fitView(): void
  /** Current pan/zoom. */
  getView(): ViewState
  /** Node size measured in the DOM, in canvas units (undefined until rendered). */
  getNodeSize(id: string): { w: number; h: number } | undefined
}

interface DragState {
  type: 'node' | 'pan'
  /** Nodes being dragged (one node, or all members of a group) */
  nodeIds?: string[]
  startX: number
  startY: number
  startPositions?: Record<string, Position>
}

interface ConnectingState {
  fromNode: string
  fromPort: string
  fromDirection: 'in' | 'out'
  mouseX: number
  mouseY: number
}

interface NodeMetrics {
  w: number
  h: number
  /** Port circle centers relative to the node's top-left corner */
  ports: Record<string, Position>
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.0
const ZOOM_STEP = 0.1

/** Padding of a group frame around its members */
export const GROUP_PADDING = 24
/** Padding around content in fitView */
const FIT_PADDING = 40

// Fallback layout constants (used until a node is measured) — must match CSS
const NODE_WIDTH = 160
const NODE_HEADER_H = 28
const PORT_ROW_H = 22
const PORT_Y_START = 6

/** Compute port position in canvas coordinates from CSS constants (fallback) */
function getPortPosition(
  node: GraphNode,
  portId: string,
  allPorts: PortDef[],
  width: number,
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

  const x = node.position.x + (isOutput ? width : 0)
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

function sameMetrics(a: NodeMetrics | undefined, b: NodeMetrics): boolean {
  if (!a || Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5) return false
  const ak = Object.keys(a.ports), bk = Object.keys(b.ports)
  if (ak.length !== bk.length) return false
  for (const k of bk) {
    const p = a.ports[k], q = b.ports[k]
    if (!p || Math.abs(p.x - q.x) > 0.5 || Math.abs(p.y - q.y) > 0.5) return false
  }
  return true
}

interface Rect { x: number; y: number; w: number; h: number }

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas({
  graph, registry, selectedNodes, selectedConnections,
  onNodeSelect, onNodeMove, onNodeMoveStart, onNodeMoveEnd, onNodeDelete,
  onConnectionCreate, onConnectionDelete, onCanvasClick, onConnectionSelect,
  onUndo, onRedo,
  renderNodeBody, renderNodePreview, initialView, readonly,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesLayerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ViewState>(initialView ?? { pan: { x: 0, y: 0 }, zoom: 1 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const [connecting, setConnecting] = useState<ConnectingState | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const dragMoved = useRef(false)

  const viewRef = useRef(view)
  viewRef.current = view
  const graphRef = useRef(graph)
  graphRef.current = graph

  // ---- Measured node sizes and port offsets (canvas units) ----
  const metricsRef = useRef<Record<string, NodeMetrics>>({})
  const [metrics, setMetrics] = useState<Record<string, NodeMetrics>>({})

  useLayoutEffect(() => {
    const layer = nodesLayerRef.current
    if (!layer) return
    const next: Record<string, NodeMetrics> = {}
    let changed = false
    layer.querySelectorAll<HTMLElement>('.nn-node[data-node-id]').forEach(el => {
      const id = el.dataset.nodeId!
      const nodeRect = el.getBoundingClientRect()
      const scale = el.offsetWidth > 0 ? nodeRect.width / el.offsetWidth : 1
      const ports: Record<string, Position> = {}
      el.querySelectorAll<HTMLElement>('.nn-port-circle[data-port-id]').forEach(c => {
        const r = c.getBoundingClientRect()
        ports[c.dataset.portId!] = {
          x: (r.left + r.width / 2 - nodeRect.left) / scale,
          y: (r.top + r.height / 2 - nodeRect.top) / scale,
        }
      })
      const m: NodeMetrics = { w: el.offsetWidth, h: el.offsetHeight, ports }
      const prev = metricsRef.current[id]
      if (sameMetrics(prev, m)) next[id] = prev
      else { next[id] = m; changed = true }
    })
    if (Object.keys(next).length !== Object.keys(metricsRef.current).length) changed = true
    if (changed) {
      metricsRef.current = next
      setMetrics(next)
    }
  })

  const nodeSize = useCallback((id: string) => {
    const m = metrics[id]
    return m ? { w: m.w, h: m.h } : DEFAULT_NODE_SIZE
  }, [metrics])

  // Compute port position for a connection endpoint
  const getPortPos = useCallback((nodeId: string, portId: string): Position | null => {
    const node = graph.nodes.find(n => n.id === nodeId)
    if (!node) return null
    const measured = metrics[nodeId]?.ports[portId]
    if (measured) return { x: node.position.x + measured.x, y: node.position.y + measured.y }
    const def = registry.get(node.type)
    if (!def) return null
    const allPorts = getAllPorts(def, node.data)
    return getPortPosition(node, portId, allPorts, metrics[nodeId]?.w ?? NODE_WIDTH)
  }, [graph.nodes, registry, metrics])

  // Connected ports per node
  const connectedPortSets = new Map<string, Set<string>>()
  for (const conn of graph.connections) {
    if (!connectedPortSets.has(conn.from.node)) connectedPortSets.set(conn.from.node, new Set())
    if (!connectedPortSets.has(conn.to.node)) connectedPortSets.set(conn.to.node, new Set())
    connectedPortSets.get(conn.from.node)!.add(conn.from.port)
    connectedPortSets.get(conn.to.node)!.add(conn.to.port)
  }

  // ---- Group frames ----
  const groupRect = (group: GraphGroup): Rect | null => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const id of group.nodes) {
      const node = graph.nodes.find(n => n.id === id)
      if (!node) continue
      const { w, h } = nodeSize(id)
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + w)
      maxY = Math.max(maxY, node.position.y + h)
    }
    if (minX === Infinity) return null
    return {
      x: minX - GROUP_PADDING,
      y: minY - GROUP_PADDING,
      w: maxX - minX + GROUP_PADDING * 2,
      h: maxY - minY + GROUP_PADDING * 2,
    }
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
        const pos = getPortPos(node.id, port.id)
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
  }, [graph.nodes, registry, getPortPos])

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
  const startNodesDrag = useCallback((nodeIds: string[], startX: number, startY: number) => {
    const startPositions: Record<string, Position> = {}
    for (const id of nodeIds) {
      const node = graph.nodes.find(n => n.id === id)
      if (node) startPositions[id] = { ...node.position }
    }
    const ids = Object.keys(startPositions)
    if (!ids.length) return
    dragMoved.current = false
    setDrag({ type: 'node', nodeIds: ids, startX, startY, startPositions })
  }, [graph.nodes])

  const handleNodeDragStart = useCallback((nodeId: string, startX: number, startY: number) => {
    if (readonly) return
    startNodesDrag([nodeId], startX, startY)
  }, [readonly, startNodesDrag])

  // ---- Group label: click selects members, drag moves them ----
  const handleGroupMouseDown = useCallback((group: GraphGroup, e: React.MouseEvent) => {
    if (e.button !== 0 || spaceHeld) return // let the canvas pan
    e.stopPropagation()
    const members = group.nodes.filter(id => graph.nodes.some(n => n.id === id))
    onNodeSelect?.(members)
    if (!readonly) startNodesDrag(members, e.clientX, e.clientY)
  }, [graph.nodes, onNodeSelect, readonly, spaceHeld, startNodesDrag])

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
        } else if (drag.type === 'node' && drag.nodeIds && drag.startPositions) {
          const dx = (e.clientX - drag.startX) / view.zoom
          const dy = (e.clientY - drag.startY) / view.zoom
          if (!dragMoved.current) {
            if (Math.round(dx) === 0 && Math.round(dy) === 0) return
            dragMoved.current = true
            onNodeMoveStart?.(drag.nodeIds)
          }
          for (const id of drag.nodeIds) {
            const start = drag.startPositions[id]
            onNodeMove?.(id, {
              x: Math.round(start.x + dx),
              y: Math.round(start.y + dy),
            })
          }
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
      if (drag) {
        if (drag.type === 'node' && dragMoved.current && drag.nodeIds) onNodeMoveEnd?.(drag.nodeIds)
        dragMoved.current = false
        setDrag(null)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [drag, connecting, view, onNodeMove, onNodeMoveStart, onNodeMoveEnd, onConnectionCreate, screenToCanvas, findNearestPort])

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

      if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        const focused = containerRef.current?.contains(document.activeElement)
        if (focused && !readonly) {
          const handler = e.shiftKey ? onRedo : onUndo
          if (handler) {
            e.preventDefault()
            handler()
          }
        }
        return
      }
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
  }, [selectedNodes, selectedConnections, readonly, onNodeDelete, onConnectionDelete, onCanvasClick, onUndo, onRedo])

  // ---- Imperative handle ----
  const [fitRequest, setFitRequest] = useState(0)

  useLayoutEffect(() => {
    if (!fitRequest) return
    const el = containerRef.current
    const g = graphRef.current
    if (!el || g.nodes.length === 0) return
    const sizeOf = (id: string) => metricsRef.current[id] ?? DEFAULT_NODE_SIZE
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const grouped = new Set(g.groups?.flatMap(gr => gr.nodes) ?? [])
    for (const n of g.nodes) {
      const { w, h } = sizeOf(n.id)
      const pad = grouped.has(n.id) ? GROUP_PADDING : 0
      minX = Math.min(minX, n.position.x - pad)
      minY = Math.min(minY, n.position.y - pad)
      maxX = Math.max(maxX, n.position.x + w + pad)
      maxY = Math.max(maxY, n.position.y + h + pad)
    }
    const width = el.clientWidth, height = el.clientHeight
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1)
    const zoom = Math.max(MIN_ZOOM, Math.min(1, (width - FIT_PADDING * 2) / bw, (height - FIT_PADDING * 2) / bh))
    setView({
      zoom,
      pan: {
        x: (width - bw * zoom) / 2 - minX * zoom,
        y: (height - bh * zoom) / 2 - minY * zoom,
      },
    })
  }, [fitRequest])

  useImperativeHandle(ref, () => ({
    fitView: () => setFitRequest(n => n + 1),
    getView: () => viewRef.current,
    getNodeSize: (id: string) => {
      const m = metricsRef.current[id]
      return m ? { w: m.w, h: m.h } : undefined
    },
  }), [])

  const zoomIn = () => setView(v => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom + ZOOM_STEP) }))
  const zoomOut = () => setView(v => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom - ZOOM_STEP) }))
  const zoomReset = () => setView({ pan: { x: 0, y: 0 }, zoom: 1 })

  // Render group frames (under connections and nodes)
  const renderGroups = () => {
    return (graph.groups ?? []).map(group => {
      const r = groupRect(group)
      if (!r) return null
      const color = group.color
      return (
        <div
          key={group.id}
          className="nn-group"
          data-group-id={group.id}
          style={{
            transform: `translate(${r.x}px, ${r.y}px)`,
            width: r.w,
            height: r.h,
            ...(color ? { borderColor: color, ['--nn-group-color' as string]: color } : {}),
          }}
        >
          <div
            className="nn-group-label"
            style={color ? { color } : undefined}
            onMouseDown={e => handleGroupMouseDown(group, e)}
            title={group.name}
          >
            {group.name}
          </div>
        </div>
      )
    })
  }

  // Render connections using computed positions
  const renderConnections = () => {
    return graph.connections.map(conn => {
      const fromPos = getPortPos(conn.from.node, conn.from.port)
      const toPos = getPortPos(conn.to.node, conn.to.port)
      if (!fromPos || !toPos) return null
      return (
        <ConnectionView
          key={conn.id}
          id={conn.id}
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
        {/* Group frames layer */}
        <div className="nn-groups-layer">
          {renderGroups()}
        </div>

        {/* SVG connections layer — use viewBox for proper sizing */}
        <svg className="nn-connections-layer" style={{ position: 'absolute', top: 0, left: 0, width: '10000px', height: '10000px', overflow: 'visible', pointerEvents: 'none' }}>
          {renderConnections()}
          {renderConnectionPreview()}
        </svg>

        {/* Nodes layer */}
        <div className="nn-nodes-layer" ref={nodesLayerRef}>
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
})
