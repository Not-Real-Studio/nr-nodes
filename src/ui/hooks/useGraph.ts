import { useState, useCallback, useRef, useEffect } from 'react'
import type { NodeGraph, GraphNode, GraphGroup, PortRef, Position, Connection } from '../../core/types.js'
import type { NodeRegistry } from '../../core/registry.js'
import type { LayoutOptions } from '../../core/layout.js'
import * as ops from '../../core/graph-ops.js'
import { layoutLayered, applyLayout as applyPositions } from '../../core/layout.js'
import { deserializeGraph } from '../../core/serialization.js'

export interface UseGraphOptions {
  initial?: NodeGraph
  registry: NodeRegistry
  /** Autosave callback. Called on every graph change. */
  onAutoSave?: (graph: NodeGraph) => void
  /** Autosave debounce interval in ms. Default: 1000 */
  autoSaveDebounce?: number
}

const UNDO_LIMIT = 50

export function useGraph(options: UseGraphOptions) {
  const { registry, onAutoSave, autoSaveDebounce = 1000 } = options
  const [graph, setGraphState] = useState<NodeGraph>(
    () => options.initial ?? ops.createEmptyGraph()
  )

  // The latest graph, updated synchronously: consecutive operations in one tick compose,
  // and undo snapshots are taken outside state updaters (StrictMode-safe).
  const graphRef = useRef(graph)

  // Undo/redo stacks
  const undoStack = useRef<NodeGraph[]>([])
  const redoStack = useRef<NodeGraph[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pushUndo = useCallback((prev: NodeGraph) => {
    undoStack.current.push(prev)
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift()
    redoStack.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  const commit = useCallback((next: NodeGraph, record: boolean) => {
    const prev = graphRef.current
    if (next === prev) return
    if (record) pushUndo(prev)
    graphRef.current = next
    setGraphState(next)
  }, [pushUndo])

  const setGraph = useCallback((newGraph: NodeGraph) => {
    commit(newGraph, true)
  }, [commit])

  const update = useCallback((fn: (g: NodeGraph) => NodeGraph) => {
    commit(fn(graphRef.current), true)
  }, [commit])

  // Autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!onAutoSave) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onAutoSave(graph), autoSaveDebounce)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [graph, onAutoSave, autoSaveDebounce])

  // Node operations
  const addNode = useCallback((type: string, position: Position): string => {
    const node = registry.createNode(type, position)
    update(g => ops.addNode(g, node)[0])
    return node.id
  }, [registry, update])

  const removeNode = useCallback((id: string) => {
    update(g => ops.removeNode(g, id))
  }, [update])

  const updateNode = useCallback((id: string, updates: Partial<GraphNode>) => {
    update(g => ops.updateNode(g, id, updates))
  }, [update])

  const updateNodeData = useCallback((id: string, data: Record<string, unknown>) => {
    update(g => ops.updateNodeData(g, id, data))
  }, [update])

  /** Move a node without recording undo (high frequency). Call `beginMove()` once
   *  before a drag to make the whole drag one undo step. */
  const moveNode = useCallback((id: string, position: Position) => {
    commit(ops.moveNode(graphRef.current, id, position), false)
  }, [commit])

  /** Record the current graph as one undo step before a series of `moveNode` calls. */
  const beginMove = useCallback(() => {
    pushUndo(graphRef.current)
  }, [pushUndo])

  // Connection operations
  const addConnection = useCallback((from: PortRef, to: PortRef): string | null => {
    const [newGraph, id] = ops.addConnection(graphRef.current, from, to, registry)
    commit(newGraph, true)
    return id
  }, [registry, commit])

  const removeConnection = useCallback((id: string) => {
    update(g => ops.removeConnection(g, id))
  }, [update])

  const getConnections = useCallback((nodeId: string, direction?: 'in' | 'out'): Connection[] => {
    return ops.getConnections(graph, nodeId, direction)
  }, [graph])

  // Group operations
  const addGroup = useCallback((group: { name: string; nodes?: string[]; color?: string }): string => {
    const [newGraph, id] = ops.addGroup(graphRef.current, group)
    commit(newGraph, true)
    return id
  }, [commit])

  const removeGroup = useCallback((id: string) => {
    update(g => ops.removeGroup(g, id))
  }, [update])

  const updateGroup = useCallback((id: string, patch: Partial<Omit<GraphGroup, 'id'>>) => {
    update(g => ops.updateGroup(g, id, patch))
  }, [update])

  const setNodeGroup = useCallback((nodeId: string, groupId: string | null) => {
    update(g => ops.setNodeGroup(g, nodeId, groupId))
  }, [update])

  /** Auto-layout the whole graph (`layoutLayered`) as one undo step. */
  const applyLayout = useCallback((opts?: LayoutOptions) => {
    update(g => applyPositions(g, layoutLayered(g, opts)))
  }, [update])

  // Graph operations
  const clearGraph = useCallback(() => {
    setGraph(ops.createEmptyGraph(graphRef.current.name))
  }, [setGraph])

  const toJSON = useCallback((): string => {
    return JSON.stringify(graph, null, 2)
  }, [graph])

  const fromJSON = useCallback((json: string) => {
    try {
      setGraph(deserializeGraph(json))
    } catch (e) {
      console.error('Failed to parse graph JSON:', e)
    }
  }, [setGraph])

  // Undo/redo
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current.pop()!
    redoStack.current.push(graphRef.current)
    graphRef.current = prev
    setGraphState(prev)
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(true)
  }, [])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current.pop()!
    undoStack.current.push(graphRef.current)
    graphRef.current = next
    setGraphState(next)
    setCanUndo(true)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  return {
    graph,
    addNode,
    removeNode,
    updateNode,
    updateNodeData,
    moveNode,
    beginMove,
    addConnection,
    removeConnection,
    getConnections,
    addGroup,
    removeGroup,
    updateGroup,
    setNodeGroup,
    applyLayout,
    setGraph,
    clearGraph,
    undo,
    redo,
    canUndo,
    canRedo,
    toJSON,
    fromJSON,
  }
}
