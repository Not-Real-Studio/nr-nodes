# SPEC: @notreal/nodes

**Модуль:** `@notreal/nodes`  
**Статус:** Draft  
**Автор:** Denis + Claude  
**Дата:** 2026-01-23

## Why

### Проблема

Node-based editors нужны в нескольких проектах:
- **namegen** — процедурная генерация текста
- **orchestrator** — LLM пайплайны
- **future** — визуальный редактор ботов, квестов, диалогов

Каждый раз писать Canvas, Node, Port, Connection, Inspector — дублирование.

### Решение

Выделить общий framework для node-based редакторов:
- Core: граф, типы, evaluation pattern
- UI: Canvas, Node, Port, Connection, Inspector
- Интеграция с @notreal/core/types для типизации портов

### Принцип: LLM-first

Типы в нодах — не compile-time контракты, а:
1. **Шаблон для промпта** — LLM видит формат
2. **Schema для парсинга** — MD → typed data
3. **Advisory validation** — warnings, не errors

## 1. Architecture

```
@notreal/nodes
├── core/           # Pure TS, no React
│   ├── types.ts    # Graph, Node, Port, Connection
│   ├── graph.ts    # Graph operations
│   ├── registry.ts # Node type registry
│   └── evaluate.ts # Evaluation pattern (abstract)
│
├── components/     # React + @notreal/web
│   ├── Canvas.tsx
│   ├── Node.tsx
│   ├── Port.tsx
│   ├── Connection.tsx
│   └── Inspector.tsx
│
├── hooks/
│   ├── useGraph.ts
│   ├── useSelection.ts
│   └── useDrag.ts
│
└── index.ts
```

**Dependencies:**
- `@notreal/core` — types, TypeRegistry
- `@notreal/web` — UI components, themes
- `react` — peer dependency

## 2. Core Types

### 2.1 Port

```typescript
interface PortDef {
  /** Уникальный ID порта в рамках ноды */
  id: string
  
  /** Отображаемое имя */
  name: string
  
  /** Направление */
  direction: 'in' | 'out'
  
  /** Тип данных (ссылка на TypeDef или inline) */
  dataType?: string | InlineType
  
  /** Antitypes — несовместимые типы (hard error) */
  antitypes?: string[]
  
  /** Строгость проверки типов */
  strict?: boolean  // override от node/schema
  
  /** Множественные соединения */
  multiple?: boolean
  
  /** Значение по умолчанию (если не подключено) */
  default?: unknown
}

interface InlineType {
  /** Поля структуры */
  fields: Record<string, string | InlineType>
}
```

### 2.2 Node

```typescript
interface NodeDef {
  /** Тип ноды (discriminator) */
  type: string
  
  /** Отображаемое имя типа */
  displayName?: string
  
  /** Иконка */
  icon?: string
  
  /** Цвет заголовка */
  color?: string
  
  /** Описание */
  description?: string
  
  /** Статические порты (всегда есть) */
  ports?: PortDef[]
  
  /** Динамические порты (создаются из data) */
  dynamicPorts?: (data: any) => PortDef[]
  
  /** Дефолт для strict на всех портах */
  strict?: boolean
  
  /** Схема данных ноды */
  dataSchema?: TypeDef
  
  /** React компонент для кастомного рендеринга */
  component?: React.ComponentType<NodeComponentProps>
  
  /** React компонент для inspector */
  inspector?: React.ComponentType<InspectorProps>
}
```

### 2.3 Graph Instance

```typescript
interface GraphNode {
  /** Уникальный ID инстанса */
  id: string
  
  /** Тип ноды (ссылка на NodeDef.type) */
  type: string
  
  /** Имя инстанса (опционально) */
  name?: string
  
  /** Позиция на canvas */
  position: { x: number; y: number }
  
  /** Данные ноды */
  data: Record<string, unknown>
}

interface Connection {
  id: string
  from: { node: string; port: string }
  to: { node: string; port: string }
}

interface NodeGraph {
  /** Версия формата */
  version: number
  
  /** Имя графа */
  name: string
  
  /** Локальные типы (для портов) */
  types?: TypeDef[]
  
  /** Default strict для графа */
  strict?: boolean
  
  /** Ноды */
  nodes: GraphNode[]
  
  /** Соединения */
  connections: Connection[]
}
```

## 3. Node Registry

```typescript
class NodeRegistry {
  /** Регистрация типа ноды */
  register(def: NodeDef): void
  
  /** Получить определение */
  get(type: string): NodeDef | undefined
  
  /** Все типы */
  getAll(): NodeDef[]
  
  /** Типы по категориям */
  getByCategory(category: string): NodeDef[]
  
  /** Создать инстанс ноды */
  createNode(type: string, position: Position, data?: any): GraphNode
}
```

## 4. Connection Validation

### 4.1 Strictness Cascade

```
port.strict > node.strict > schema.strict > graph.strict > default (false)
```

### 4.2 Validation Rules

```typescript
type ConnectionValidation = 
  | { valid: true }
  | { valid: false; level: 'warning' | 'error'; message: string }

function validateConnection(
  from: { node: GraphNode; port: PortDef },
  to: { node: GraphNode; port: PortDef },
  typeRegistry: TypeRegistry
): ConnectionValidation {
  // 1. Direction check
  if (from.port.direction !== 'out' || to.port.direction !== 'in') {
    return { valid: false, level: 'error', message: 'Invalid direction' }
  }
  
  // 2. Antitype check (always error)
  if (to.port.antitypes?.includes(from.port.dataType)) {
    return { valid: false, level: 'error', message: 'Incompatible types' }
  }
  
  // 3. Any type — always ok
  if (!from.port.dataType || !to.port.dataType || 
      from.port.dataType === 'any' || to.port.dataType === 'any') {
    return { valid: true }
  }
  
  // 4. Type match
  if (typesMatch(from.port.dataType, to.port.dataType, typeRegistry)) {
    return { valid: true }
  }
  
  // 5. Mismatch — check strictness
  const strict = to.port.strict ?? /* cascade */ false
  return {
    valid: false,
    level: strict ? 'error' : 'warning',
    message: `Type mismatch: ${from.port.dataType} → ${to.port.dataType}`
  }
}
```

### 4.3 Type Matching

```typescript
function typesMatch(
  from: string | InlineType,
  to: string | InlineType,
  registry: TypeRegistry
): boolean {
  // Exact match
  if (from === to) return true
  
  // Inheritance
  if (typeof from === 'string' && typeof to === 'string') {
    const fromDef = registry.get(from)
    if (fromDef && isSubtype(fromDef, to, registry)) return true
  }
  
  // Structural (duck typing for inline types)
  // { name, surname, phone } matches { name, phone }
  if (typeof from === 'object' && typeof to === 'object') {
    return Object.keys(to.fields).every(k => k in from.fields)
  }
  
  return false
}
```

## 5. MD Format

### 5.1 Graph File

```markdown
---
type: graph
version: 2
name: Person Generator
strict: false
---

## @types

Person: { name, surname, gender, nationality }
Contact: { phone, address }
PhoneEntry: { name, surname, phone }

## @list names
@id: n1
@pos: 100, 50
Александр
Михаил
Дмитрий

## @template person
@id: t1
@pos: 300, 50
@in.name: string
@in.surname: string
@out: Person

{{name}} {{surname}}

## @llm contact_gen
@id: l1
@pos: 300, 200
@in.nationality: string
@out: Contact
@prompt: |
  Сгенерируй контактные данные для {{nationality}}.
  {{@format out}}

## @output
@id: out1
@pos: 500, 100
@in: PhoneEntry[]
@seed: 42
@count: 10

## @connections
n1 → t1.name
n1 → t1.surname
t1 → out1
```

### 5.2 Node Types in MD

```markdown
## @{type} {name?}
@id: {required}
@pos: {x}, {y}
@in.{port}: {type}
@out.{port}: {type}
@{attribute}: {value}

{content}
```

## 6. UI Components

### 6.1 Canvas

```typescript
interface CanvasProps {
  graph: NodeGraph
  registry: NodeRegistry
  typeRegistry?: TypeRegistry
  
  // Callbacks
  onNodeSelect?: (id: string | null) => void
  onNodeMove?: (id: string, pos: Position) => void
  onNodeDelete?: (id: string) => void
  onConnect?: (from: PortRef, to: PortRef) => void
  onDisconnect?: (connectionId: string) => void
  
  // Options
  gridSize?: number
  snapToGrid?: boolean
  readonly?: boolean
  
  // Render customization
  renderNode?: (node: GraphNode, def: NodeDef) => React.ReactNode
  renderConnection?: (conn: Connection, validation: ConnectionValidation) => React.ReactNode
}
```

### 6.2 Node

```typescript
interface NodeComponentProps {
  node: GraphNode
  def: NodeDef
  ports: PortDef[]  // resolved (static + dynamic)
  selected: boolean
  preview?: string  // preview value
  
  onPortClick?: (portId: string, direction: 'in' | 'out') => void
}
```

### 6.3 Inspector

```typescript
interface InspectorProps {
  node: GraphNode
  def: NodeDef
  graph: NodeGraph
  
  onChange: (data: Partial<GraphNode>) => void
}
```

## 7. Evaluation Pattern

Abstract pattern — конкретная реализация в приложении.

```typescript
interface EvaluationContext<T = unknown> {
  /** Получить значение на порту */
  getInput<V = unknown>(portId: string): V | undefined
  
  /** Установить значение на порту */
  setOutput(portId: string, value: unknown): void
  
  /** Данные ноды */
  data: T
  
  /** Кастомный контекст приложения */
  app: unknown
}

interface NodeEvaluator<T = unknown> {
  /** Выполнить ноду */
  evaluate(ctx: EvaluationContext<T>): void | Promise<void>
}

abstract class GraphEvaluator {
  protected graph: NodeGraph
  protected registry: NodeRegistry
  protected evaluators: Map<string, NodeEvaluator>
  
  /** Выполнить граф от output ноды */
  abstract evaluate(outputNodeId: string): Promise<unknown>
}
```

### 7.1 Sync vs Async

**namegen:** sync, декартово произведение
**orchestrator:** async, LLM calls

Библиотека даёт pattern, приложение реализует.

## 8. Hooks

### 8.1 useGraph

```typescript
function useGraph(initial?: NodeGraph): {
  graph: NodeGraph
  
  // Nodes
  addNode: (type: string, position: Position, data?: any) => string
  updateNode: (id: string, updates: Partial<GraphNode>) => void
  deleteNode: (id: string) => void
  
  // Connections
  connect: (from: PortRef, to: PortRef) => string | null
  disconnect: (id: string) => void
  
  // Serialization
  toMarkdown: () => string
  fromMarkdown: (md: string) => void
  
  // Undo/redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}
```

### 8.2 useSelection

```typescript
function useSelection(): {
  selectedNodes: string[]
  selectedConnections: string[]
  
  selectNode: (id: string, multi?: boolean) => void
  selectConnection: (id: string) => void
  clearSelection: () => void
  selectAll: () => void
}
```

## 9. Integration with @notreal/core/types

### 9.1 Type Resolution

```typescript
// Порт ссылается на тип по имени
@out: Person

// TypeRegistry резолвит
const typeDef = typeRegistry.get('Person')
```

### 9.2 Format Generation

```typescript
// В промпте LLM ноды
@prompt: |
  {{@format out}}
  
// Раскрывается через TypeDef
const formatSpec = generateFormatSpec(typeDef)
// →
// Формат ответа:
// ## @person Name
// @gender: male/female
// @nationality: ...
```

### 9.3 Output Parsing

```typescript
// LLM output → mdAdapter.parse()
const result = mdAdapter.parse(llmOutput, typeRegistry, portType)
```

## 10. Implementation Plan

### Phase 1: Core Types
- [ ] Port, Node, Connection, Graph interfaces
- [ ] NodeRegistry
- [ ] Connection validation logic
- [ ] MD parser for graphs (using @notreal/core/parser)
- [ ] MD serializer for graphs

### Phase 2: UI Components  
- [ ] Canvas (pan/zoom, grid)
- [ ] Node (ports, selection, preview)
- [ ] Port (connection points, type indicators)
- [ ] Connection (bezier curves, validation colors)
- [ ] Basic Inspector

### Phase 3: Hooks
- [ ] useGraph (CRUD, undo/redo)
- [ ] useSelection
- [ ] useDrag
- [ ] useConnectionDraw

### Phase 4: Integration
- [ ] TypeRegistry integration
- [ ] Format generation helper
- [ ] Validation UI (warnings/errors on connections)

### Phase 5: Migration
- [ ] Extract from namegen
- [ ] Migrate namegen to use @notreal/nodes
- [ ] Документация

## 11. File Structure

```
s:/libs/nodes/
├── docs/
│   ├── specs/
│   │   └── spec-nodes.md
│   └── API.md
├── src/
│   ├── core/
│   │   ├── types.ts
│   │   ├── graph.ts
│   │   ├── registry.ts
│   │   ├── validation.ts
│   │   ├── md-parser.ts
│   │   └── md-serializer.ts
│   ├── components/
│   │   ├── Canvas/
│   │   ├── Node/
│   │   ├── Port/
│   │   ├── Connection/
│   │   └── Inspector/
│   ├── hooks/
│   │   ├── useGraph.ts
│   │   ├── useSelection.ts
│   │   └── useDrag.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 12. Example: Migrated namegen

```typescript
import { NodeRegistry, useGraph, Canvas } from '@notreal/nodes'
import { ListNode, UnionNode, TemplateNode, OutputNode } from './nodes'
import { NamegenEvaluator } from './evaluator'

// Register node types
const registry = new NodeRegistry()
registry.register(ListNode)
registry.register(UnionNode)
registry.register(TemplateNode)
registry.register(OutputNode)

// App
function NamegenEditor() {
  const { graph, addNode, connect, toMarkdown } = useGraph()
  
  const handleGenerate = () => {
    const evaluator = new NamegenEvaluator(graph, registry)
    const results = evaluator.evaluate('output-1')
    console.log(results)
  }
  
  return (
    <Canvas
      graph={graph}
      registry={registry}
      onNodeSelect={...}
    />
  )
}
```

## Open Questions

1. **Групповые ноды** — ноды внутри нод (subgraphs)?
2. **Комментарии на canvas** — sticky notes?
3. **Minimap** — нужен ли?
4. **Keyboard shortcuts** — стандартизировать?
