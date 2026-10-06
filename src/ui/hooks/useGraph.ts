import { useState, useCallback, useRef, useEffect } from 'react'
import type { NodeGraph, GraphNode, PortRef, Position, Connection } from '../../core/types'
import type { NodeRegistry } from '../../core/registry'
import * as ops from '../../core/graph-ops'

export interface UseGraphOptions {
  initial?: NodeGraph
  registry: NodeRegistry
  /** Autosave callback. Called on every graph change. */
  onAutoSave?: (graph: NodeGraph) => void
  /** Autosave debounce interval in ms. Default: 1000 */
  autoSaveDebounce?: number
}

export function useGraph(options: UseGraphOptions) {
  const { registry, onAutoSave, autoSaveDebounce = 1000 } = options
  const [graph, setGraphState] = useState<NodeGraph>(
    options.initial ?? ops.createEmptyGraph()
  )

  // Undo/redo stacks (API exposed, implementation simple)
  const undoStack = useRef<NodeGraph[]>([])
  const redoStack = useRef<NodeGraph[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pushUndo = (prev: NodeGraph) => {
    undoStack.current.push(prev)
    if (undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
    setCanUndo(true)
    setCanRedo(false)
  }

  const setGraph = useCallback((newGraph: NodeGraph) => {
    setGraphState(prev => {
      pushUndo(prev)
      return newGraph
    })
  }, [])

  const update = useCallback((fn: (g: NodeGraph) => NodeGraph) => {
    setGraphState(prev => {
      pushUndo(prev)
      return fn(prev)
    })
  }, [])

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

  const moveNode = useCallback((id: string, position: Position) => {
    // Move without pushing to undo stack (high frequency)
    setGraphState(g => ops.moveNode(g, id, position))
  }, [])

  // Connection operations
  const addConnection = useCallback((from: PortRef, to: PortRef): string | null => {
    let connId: string | null = null
    update(g => {
      const [newGraph, id] = ops.addConnection(g, from, to, registry)
      connId = id
      return newGraph
    })
    return connId
  }, [registry, update])

  const removeConnection = useCallback((id: string) => {
    update(g => ops.removeConnection(g, id))
  }, [update])

  const getConnections = useCallback((nodeId: string, direction?: 'in' | 'out'): Connection[] => {
    return ops.getConnections(graph, nodeId, direction)
  }, [graph])

  // Graph operations
  const clearGraph = useCallback(() => {
    setGraph(ops.createEmptyGraph(graph.name))
  }, [graph.name, setGraph])

  const toJSON = useCallback((): string => {
    return JSON.stringify(graph, null, 2)
  }, [graph])

  const fromJSON = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as NodeGraph
      setGraph(parsed)
    } catch (e) {
      console.error('Failed to parse graph JSON:', e)
    }
  }, [setGraph])

  // Undo/redo
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prev = undoStack.current.pop()!
    setGraphState(current => {
      redoStack.current.push(current)
      setCanUndo(undoStack.current.length > 0)
      setCanRedo(true)
      return prev
    })
  }, [])

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return
    const next = redoStack.current.pop()!
    setGraphState(current => {
      undoStack.current.push(current)
      setCanUndo(true)
      setCanRedo(redoStack.current.length > 0)
      return next
    })
  }, [])

  return {
    graph,
    addNode,
    removeNode,
    updateNode,
    updateNodeData,
    moveNode,
    addConnection,
    removeConnection,
    getConnections,
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
