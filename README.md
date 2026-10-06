# @notrealstudio/nr-nodes

Node-graph editor in two layers:

- **`@notrealstudio/nr-nodes/core`** — headless, no React at runtime: node prototype
  registry, immutable graph operations, connection validation, groups, layered
  auto-layout, JSON (de)serialization. Runs anywhere.
- **`@notrealstudio/nr-nodes/ui`** — React (18 or 19) editor: canvas with pan/zoom, nodes,
  ports, bezier connections, group frames, inspector, toolbar, `useGraph` (operations +
  undo/redo + autosave) and `useSelection`. Styles: `@notrealstudio/nr-nodes/ui/styles`.

No dependencies besides the `react` peer.

## Minimal consumer

```tsx
import { useMemo, useRef } from 'react'
import { NodeRegistry } from '@notrealstudio/nr-nodes/core'
import { Canvas, useGraph, useSelection, type CanvasHandle } from '@notrealstudio/nr-nodes/ui'
import '@notrealstudio/nr-nodes/ui/styles'

const registry = new NodeRegistry()
registry.register({
  type: 'step',
  displayName: 'Step',
  ports: [
    { id: 'in', name: 'in', direction: 'in', multiple: true },
    { id: 'out', name: 'out', direction: 'out' },
  ],
})

export function Editor() {
  const g = useGraph({ registry })
  const sel = useSelection()
  const canvas = useRef<CanvasHandle>(null)

  return (
    <div style={{ height: 600 }}>
      <button onClick={() => g.addNode('step', { x: 0, y: 0 })}>Add</button>
      <button onClick={() => { g.applyLayout(); canvas.current?.fitView() }}>Layout</button>
      <Canvas
        ref={canvas}
        graph={g.graph}
        registry={registry}
        selectedNodes={sel.selectedNodes}
        selectedConnections={sel.selectedConnections}
        onNodeSelect={sel.selectNodes}
        onNodeMove={g.moveNode}
        onNodeMoveStart={g.beginMove}
        onNodeDelete={ids => ids.forEach(g.removeNode)}
        onConnectionCreate={(from, to) => g.addConnection(from, to)}
        onConnectionDelete={ids => ids.forEach(g.removeConnection)}
        onConnectionSelect={sel.selectConnection}
        onCanvasClick={sel.deselectAll}
        onUndo={g.undo}
        onRedo={g.redo}
      />
    </div>
  )
}
```

A fuller example (toolbar, inspector, groups) is in [`demo/`](demo/App.tsx): `npm run demo`.

## Graph

```ts
interface NodeGraph {
  version: number
  name: string
  nodes: GraphNode[]          // { id, type, name?, position, data }
  connections: Connection[]   // { id, from: {node, port}, to: {node, port} }
  groups?: GraphGroup[]       // { id, name, nodes: string[], color? }
  meta?: Record<string, unknown>
}
```

All operations are pure: `addNode`, `removeNode`, `updateNode`, `updateNodeData`,
`moveNode`, `moveNodes`, `addConnection` (validated against the registry; a non-`multiple`
input keeps one connection), `removeConnection`, `getConnections`, `getPortConnections`,
`topologicalSort` (`null` on a cycle).

## Groups

A node belongs to at most one group. `addGroup(graph, { name, nodes?, color? })` →
`[graph, id]`, `removeGroup` (nodes stay), `updateGroup(graph, id, patch)`,
`setNodeGroup(graph, nodeId, groupId | null)` (moves the node out of its previous group),
`getNodeGroup`. `removeNode` drops the node from its group. Graphs without `groups` are
valid.

On the canvas each non-empty group is a frame around its members (padding 24) under the
nodes, labelled with its name in its `color`. Clicking the label selects all members,
dragging it moves them all (one undo step).

## Auto-layout

```ts
layoutLayered(graph, { direction?: 'LR' | 'TB', nodeSize?, gapX?: 80, gapY?: 40 })
  → Record<nodeId, Position>
applyLayout(graph, positions) → NodeGraph
```

Deterministic layered layout without dependencies: layers by longest path from sources
(cycle-closing edges ignored, isolated nodes in layer 0), order inside a layer by
barycenter (one pass down, one up), members of one group kept adjacent inside a layer
(group order from `graph.groups`, ungrouped nodes after), layers offset by the widest node
+ `gapX`. Default node size 220×120; pass `nodeSize` (e.g. from
`CanvasHandle.getNodeSize`) for measured sizes. In the editor: `useGraph().applyLayout(opts)`
— one undo step.

## Canvas

Pan with the middle button or Space + left drag, zoom with the wheel around the cursor,
drag nodes by any non-port part, drag from a port to a port of the opposite direction to
connect (drop within 30px of the port), click a connection to select it,
Delete/Backspace removes the selection, Escape clears it and cancels a connection drag,
Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z call `onUndo` / `onRedo` while the canvas has focus.

`ref` gives `{ fitView(), getView(), getNodeSize(id) }`; `initialView` sets the starting
pan/zoom. One drag = one `onNodeMoveStart` / `onNodeMoveEnd` pair, fired only if the
pointer actually moved.

## Theme

`@notrealstudio/nr-nodes/ui/styles` styles every colour, font and radius through `--nn-*` variables,
declared once on the component roots (`.nn-canvas`, `.nn-inspector`, `.nn-toolbar`). Each reads a host
theme token and falls back to the editor's own dark look:

| host token | used for |
|---|---|
| `--nr-bg` | canvas, sunken panels |
| `--nr-surface` | nodes, inspector, toolbar |
| `--nr-raised` | node header, inputs, buttons |
| `--nr-line`, `--nr-line-soft` | borders, grid dots |
| `--nr-fg`, `--nr-muted` | text, secondary text |
| `--nr-accent` | selection, connections, connected ports |
| `--nr-error` | errors, delete |
| `--nr-font-ui`, `--nr-font-mono`, `--nr-radius` | type and shape |

Set the tokens on any ancestor (nrchat does it on `:root`) and the editor looks like the host; without
them it looks as before. To tweak one thing, override the `--nn-*` variable on the root. A node's header
colour still comes from `NodeDef.color`. The demo has a light/dark switch (`Theme:` in the toolbar).

## Development

```sh
npm install
npm run build      # dist/ (tsc + css)
npm test           # core unit tests (vitest)
npm run e2e        # Playwright against the demo (starts it on :5190)
npm run demo       # vite dev server, http://localhost:5190
```

## License

MIT
