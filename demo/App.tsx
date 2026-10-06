import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  NodeRegistry, applyLayout, layoutLayered, removeNode, removeConnection, DEFAULT_NODE_SIZE,
} from '@notrealstudio/nr-nodes/core'
import type { NodeGraph, NodeInspectorProps, PortRef, Position } from '@notrealstudio/nr-nodes/core'
import { Canvas, InspectorShell, Toolbar, useGraph, useSelection } from '@notrealstudio/nr-nodes/ui'
import type { CanvasHandle } from '@notrealstudio/nr-nodes/ui'

function StepInspector({ node, onChange }: NodeInspectorProps) {
  return (
    <div className="nn-inspector-field">
      <label className="nn-inspector-label">Text</label>
      <input
        className="nn-inspector-input"
        data-testid="step-text"
        value={String(node.data.text ?? '')}
        onChange={e => onChange({ text: e.target.value })}
      />
    </div>
  )
}

function createRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  registry.register({
    type: 'source',
    displayName: 'Source',
    icon: '📥',
    color: '#2e5d4b',
    ports: [{ id: 'out', name: 'out', direction: 'out' }],
  })
  registry.register({
    type: 'step',
    displayName: 'Step',
    icon: '⚙️',
    color: '#3b4a7a',
    ports: [
      { id: 'in', name: 'in', direction: 'in', multiple: true },
      { id: 'out', name: 'out', direction: 'out' },
    ],
    defaultData: { text: '' },
    inspectorComponent: StepInspector,
  })
  registry.register({
    type: 'sink',
    displayName: 'Sink',
    icon: '📤',
    color: '#6a3b4a',
    ports: [{ id: 'in', name: 'in', direction: 'in' }],
  })
  return registry
}

/** Start graph: two "characters" (groups) feeding one merge step. No coordinates. */
function startGraph(): NodeGraph {
  const node = (id: string, type: string, name: string) =>
    ({ id, type, name, position: { x: 0, y: 0 }, data: type === 'step' ? { text: '' } : {} })
  const link = (id: string, from: string, to: string) =>
    ({ id, from: { node: from, port: 'out' }, to: { node: to, port: 'in' } })
  return {
    version: 2,
    name: 'Demo pipeline',
    nodes: [
      node('srcA', 'source', 'Alice card'),
      node('stepA1', 'step', 'Alice persona'),
      node('stepA2', 'step', 'Alice greeting'),
      node('srcB', 'source', 'Bob card'),
      node('stepB1', 'step', 'Bob persona'),
      node('stepB2', 'step', 'Bob greeting'),
      node('merge', 'step', 'Merge'),
      node('out', 'sink', 'Output'),
    ],
    connections: [
      link('c1', 'srcA', 'stepA1'), link('c2', 'stepA1', 'stepA2'), link('c3', 'stepA2', 'merge'),
      link('c4', 'srcB', 'stepB1'), link('c5', 'stepB1', 'stepB2'), link('c6', 'stepB2', 'merge'),
      link('c7', 'merge', 'out'),
    ],
    groups: [
      { id: 'alice', name: 'Alice', nodes: ['srcA', 'stepA1', 'stepA2'], color: '#4a9eff' },
      { id: 'bob', name: 'Bob', nodes: ['srcB', 'stepB1', 'stepB2'], color: '#ffb347' },
    ],
  }
}

/**
 * Host theme tokens (nrchat's --nr-*), set on the page root the way a host app
 * does. 'none' — no tokens: the editor falls back to its own dark look.
 */
type DemoTheme = 'none' | 'light' | 'dark'
const THEMES: Record<Exclude<DemoTheme, 'none'>, Record<string, string>> = {
  light: {
    '--nr-bg': '#f6efe3', '--nr-surface': '#efe6d8', '--nr-raised': '#fffaf0',
    '--nr-fg': '#1f1a14', '--nr-muted': 'rgb(31 26 20 / 0.7)',
    '--nr-line': '#ddd0bb', '--nr-line-soft': '#e3d7c4',
    '--nr-accent': '#b5651d', '--nr-error': '#a8452c',
    '--nr-font-ui': 'system-ui, -apple-system, sans-serif', '--nr-font-mono': 'ui-monospace, Menlo, monospace',
    '--nr-radius': '5px',
  },
  dark: {
    '--nr-bg': '#171310', '--nr-surface': '#1f1a16', '--nr-raised': '#2a231d',
    '--nr-fg': '#efe6da', '--nr-muted': 'rgb(239 230 218 / 0.72)',
    '--nr-line': '#3a3128', '--nr-line-soft': '#2a241e',
    '--nr-accent': '#d08a4a', '--nr-error': '#d46a50',
    '--nr-font-ui': 'system-ui, -apple-system, sans-serif', '--nr-font-mono': 'ui-monospace, Menlo, monospace',
    '--nr-radius': '5px',
  },
}
const NEXT_THEME: Record<DemoTheme, DemoTheme> = { none: 'light', light: 'dark', dark: 'none' }

function useDemoTheme(theme: DemoTheme) {
  useEffect(() => {
    const root = document.documentElement
    for (const key of Object.keys(THEMES.light)) root.style.removeProperty(key)
    if (theme !== 'none') for (const [key, value] of Object.entries(THEMES[theme])) root.style.setProperty(key, value)
    root.dataset.theme = theme
  }, [theme])
}

export function App() {
  const [theme, setTheme] = useState<DemoTheme>('none')
  useDemoTheme(theme)
  const registry = useMemo(createRegistry, [])
  const initial = useMemo(() => {
    const g = startGraph()
    return applyLayout(g, layoutLayered(g))
  }, [])

  const {
    graph, setGraph, addNode, updateNode, updateNodeData, moveNode, beginMove,
    addConnection, applyLayout: autoLayout, undo, redo, canUndo, canRedo,
  } = useGraph({ registry, initial })
  const { selectedNodes, selectedConnections, selectNodes, selectConnection, deselectAll } = useSelection()
  const canvasRef = useRef<CanvasHandle>(null)

  useEffect(() => { canvasRef.current?.fitView() }, [])

  const handleAddNode = useCallback((type: string) => {
    const maxX = graph.nodes.length ? Math.max(...graph.nodes.map(n => n.position.x)) : 0
    const id = addNode(type, { x: maxX + DEFAULT_NODE_SIZE.w + 80, y: 0 })
    selectNodes([id])
  }, [graph.nodes, addNode, selectNodes])

  const handleAutoLayout = useCallback(() => {
    autoLayout({ nodeSize: n => canvasRef.current?.getNodeSize(n.id) ?? DEFAULT_NODE_SIZE })
    canvasRef.current?.fitView()
  }, [autoLayout])

  const handleNodeDelete = useCallback((ids: string[]) => {
    setGraph(ids.reduce(removeNode, graph))
    deselectAll()
  }, [graph, setGraph, deselectAll])

  const handleConnectionDelete = useCallback((ids: string[]) => {
    setGraph(ids.reduce(removeConnection, graph))
    deselectAll()
  }, [graph, setGraph, deselectAll])

  const handleNodeMove = useCallback((id: string, position: Position) => moveNode(id, position), [moveNode])
  const handleConnect = useCallback((from: PortRef, to: PortRef) => { addConnection(from, to) }, [addConnection])

  const selected = selectedNodes.length === 1
    ? graph.nodes.find(n => n.id === selectedNodes[0]) ?? null
    : null

  return (
    <div className="demo">
      <div className="demo-toolbar">
        <Toolbar
          registry={registry}
          onAddNode={handleAddNode}
          onAutoLayout={handleAutoLayout}
          graphName={graph.name}
          onNameChange={name => setGraph({ ...graph, name })}
          extra={<>
            <button className="nn-toolbar-btn" onClick={undo} disabled={!canUndo}>Undo</button>
            <button className="nn-toolbar-btn" onClick={redo} disabled={!canRedo}>Redo</button>
            <button className="nn-toolbar-btn" onClick={() => canvasRef.current?.fitView()}>Fit</button>
            <button className="nn-toolbar-btn" data-testid="demo-theme" onClick={() => setTheme(NEXT_THEME[theme])}>
              Theme: {theme === 'none' ? 'default' : theme}
            </button>
          </>}
        />
      </div>
      <div className="demo-canvas">
        <Canvas
          ref={canvasRef}
          graph={graph}
          registry={registry}
          selectedNodes={selectedNodes}
          selectedConnections={selectedConnections}
          onNodeSelect={selectNodes}
          onNodeMove={handleNodeMove}
          onNodeMoveStart={beginMove}
          onNodeDelete={handleNodeDelete}
          onConnectionCreate={handleConnect}
          onConnectionDelete={handleConnectionDelete}
          onConnectionSelect={selectConnection}
          onCanvasClick={deselectAll}
          onUndo={undo}
          onRedo={redo}
        />
      </div>
      <div className="demo-inspector">
        <InspectorShell
          node={selected}
          def={selected ? registry.get(selected.type) ?? null : null}
          graph={graph}
          onUpdateNode={updateNode}
          onUpdateData={updateNodeData}
          onDeleteNode={id => handleNodeDelete([id])}
        />
      </div>
    </div>
  )
}
