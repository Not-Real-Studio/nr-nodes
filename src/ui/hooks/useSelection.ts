import { useState, useCallback } from 'react'
import type { NodeGraph } from '../../core/types.js'
import { removeNode, removeConnection } from '../../core/graph-ops.js'

export function useSelection() {
  const [selectedNodes, setSelectedNodes] = useState<string[]>([])
  const [selectedConnections, setSelectedConnections] = useState<string[]>([])

  const selectNode = useCallback((id: string, multi = false) => {
    setSelectedConnections([])
    if (multi) {
      setSelectedNodes(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      )
    } else {
      setSelectedNodes([id])
    }
  }, [])

  const selectConnection = useCallback((id: string) => {
    setSelectedNodes([])
    setSelectedConnections([id])
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedNodes([])
    setSelectedConnections([])
  }, [])

  /** Remove all selected items from graph. Returns new graph. */
  const deleteSelected = useCallback((graph: NodeGraph): NodeGraph => {
    let g = graph
    for (const id of selectedNodes) {
      g = removeNode(g, id)
    }
    for (const id of selectedConnections) {
      g = removeConnection(g, id)
    }
    setSelectedNodes([])
    setSelectedConnections([])
    return g
  }, [selectedNodes, selectedConnections])

  return {
    selectedNodes,
    selectedConnections,
    selectNode,
    selectConnection,
    deselectAll,
    deleteSelected,
  }
}
