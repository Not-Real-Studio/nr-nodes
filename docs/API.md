# @notreal/nodes

## core
NodeDef { type, displayName, icon?, color?, category?, description?, ports, dynamicPorts?, defaultData?, bodyComponent?, inspectorComponent? }
PortDef { id, name, direction, type?, multiple?, default? }
NodeGraph { version, name, nodes, connections, meta? }
GraphNode { id, type, name?, position, data }
Connection { id, from, to }
PortRef { node, port }
Position { x, y }
NodeBodyProps { node, def, graph }
NodeInspectorProps { node, def, graph, onChange }
ConnectionValidationResult { valid, message? }
ViewState { pan, zoom }
NodeRegistry { register, get, getAll, getByCategory, getCategories, createNode }
createEmptyGraph(name?: string): NodeGraph
addNode(graph: NodeGraph, node: GraphNode): [NodeGraph, string]
> Add a node. Returns [new graph, node id].
removeNode(graph: NodeGraph, nodeId: string): NodeGraph
> Remove a node and all its connections.
updateNode(graph: NodeGraph, nodeId: string, updates: Partial<GraphNode>): NodeGraph
> Update a node (partial merge).
updateNodeData(graph: NodeGraph, nodeId: string, data: Record<string, unknown>): NodeGraph
> Update node data (merge into data).
moveNode(graph: NodeGraph, nodeId: string, position: Position): NodeGraph
> Move a node.
addConnection(graph: NodeGraph, from: PortRef, to: PortRef, registry: NodeRegistry): [NodeGraph, string | null]
> Add a connection. If target port is not multiple, replaces existing.
Returns [new graph, connection id] or [graph, null] on validation failure.
removeConnection(graph: NodeGraph, connectionId: string): NodeGraph
> Remove a connection.
getConnections(graph: NodeGraph, nodeId: string, direction?: "in" | "out" | undefined): Connection[]
> Get all connections to/from a node.
getPortConnections(graph: NodeGraph, nodeId: string, portId: string): Connection[]
> Get connections to a specific port.
topologicalSort(graph: NodeGraph): string[] | null
> Topological sort. Returns null if cycle detected.
validateConnection(graph: NodeGraph, from: PortRef, to: PortRef, registry: NodeRegistry): ConnectionValidationResult
> Validate a connection before creating it
getNodePorts(graph: NodeGraph, nodeId: string, registry: NodeRegistry): PortDef[]
> Get all ports for a node (static + dynamic)
findPort(graph: NodeGraph, ref: PortRef, registry: NodeRegistry): PortDef | undefined
> Find a specific port definition
serializeGraph(graph: NodeGraph): string
> Serialize graph to JSON string
deserializeGraph(json: string): NodeGraph
> Deserialize graph from JSON string
generateId(length?: number): string
> Generate pronounceable ID in CVCVCV pattern

## ui
Canvas({
  graph, registry, selectedNodes, selectedConnections,
  onNodeSelect, onNodeMove, onNodeDelete,
  onConnectionCreate, onConnectionDelete, onCanvasClick,
  renderNodeBody, renderNodePreview, readonly,
}: CanvasProps): Element
CanvasProps { graph, registry, selectedNodes, selectedConnections, onNodeSelect?, onNodeMove?, onNodeDelete?, onConnectionCreate?, onConnectionDelete?, onCanvasClick?, renderNodeBody?, renderNodePreview?, readonly? }
NodeView({
  node, def, graph, selected, onSelect, onDragStart,
  onPortDragStart, onPortDragEnd, connectedPorts,
  renderBody, renderPreview, onPortPosition,
}: NodeViewProps): Element
NodeViewProps { node, def, graph, selected?, onSelect?, onDragStart?, onPortDragStart?, onPortDragEnd?, connectedPorts?, renderBody?, renderPreview?, onPortPosition? }
ConnectionView({ from, to, selected, warning, onClick }: ConnectionViewProps): Element
ConnectionViewProps { from, to, selected?, warning?, onClick? }
ConnectionPreview({ from, to }: ConnectionPreviewProps): Element
ConnectionPreviewProps { from, to }
PortView({ port, nodeId, onDragStart, onDragEnd, connected }: PortViewProps): Element
PortViewProps { port, nodeId, onPositionReport?, onDragStart?, onDragEnd?, connected? }
InspectorShell({
  node, def, graph, onUpdateNode, onUpdateData, onDeleteNode,
}: InspectorShellProps): Element
InspectorShellProps { node, def, graph, onUpdateNode, onUpdateData, onDeleteNode }
Toolbar({
  registry, onAddNode, onSave, onLoad, onClear,
  graphName, onNameChange, extra,
}: ToolbarProps): Element
ToolbarProps { registry, onAddNode, onSave?, onLoad?, onClear?, graphName?, onNameChange?, extra? }
NodeErrorBoundary { getDerivedStateFromError, render }
> Error boundary for node components. Catches errors in user-provided components.
useGraph(options: UseGraphOptions): { graph: NodeGraph; addNode: (type: string, position: Position) => string; removeNode: (id: string) => void; updateNode: (id: string, updates: Partial<GraphNode>) => void; updateNodeData: (id: string, data: Record<string, unknown>) => void; moveNode: (id: string, position: Position) => void; addConnection: (from: PortRef, to: PortRef) => string | null; removeConnection: (id: string) => void; getConnections: (nodeId: string, direction?: "in" | "out" | undefined) => Connection[]; setGraph: (newGraph: NodeGraph) => void; clearGraph: () => void; undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean; toJSON: () => string; fromJSON: (json: string) => void; }
UseGraphOptions { initial?, registry, onAutoSave?, autoSaveDebounce? }
useSelection(): { selectedNodes: string[]; selectedConnections: string[]; selectNode: (id: string, multi?: boolean) => void; selectConnection: (id: string) => void; deselectAll: () => void; deleteSelected: (graph: NodeGraph) => NodeGraph; }