# SPEC: @notreal/nodes v2 + namegen editor

Нодовый runtime + визуальный редактор. Первый потребитель — namegen.

## Контекст

Нодовый граф — универсальный примитив. ngen, оркестраторы, стейт машины, скриптинг, диалоги, квесты — всё это граф из типизированных нод с типизированными связями. Разница — в конкретных нодах и способе исполнения. Библиотека даёт: граф, визуальный редактор, registry. Потребитель даёт: конкретные ноды, конкретный execution.

### Потребители (текущие и будущие)

| Потребитель | Тип графа | Execution | Пример нод |
|--|--|--|--|
| ngen | data flow | sync, pull от output | List, Union, Template, Sample |
| orchestrator | mixed flow | async, sequential | LLMCall, Prompt, Parse, Condition |
| state machine | state graph | event-driven | State, Transition, Action |
| scripting (Bolt) | execution flow | sequential | If, Loop, Call, Set, Event |
| диалоги | dialogue tree | player-driven | Say, Choice, Branch, Check |

Все используют одну и ту же структуру: ноды с портами, связи между портами, registry прототипов.

## Архитектура

### Два слоя

**@notreal/nodes** — библиотека (S:\libs\nodes)
- Core: граф, типы, registry, validation, serialization. Чистый TS, без React.
- UI: Canvas, NodeView, ConnectionView, InspectorShell, хуки. React + CSS.
- **Не содержит** конкретных нод, конкретных инспекторов, конкретного execution.

**namegen editor** — приложение (S:\Projects\namegen)
- Импортирует @notreal/nodes для визуала
- Импортирует @notreal/core/ngen для движка
- Регистрирует конкретные ноды (List, Union, Template, Sample, Output)
- Реализует конкретные инспекторы
- Реализует execution через core/ngen generate()
- Save/Load .md файлов

---

## @notreal/nodes — Core

### NodeDef — прототип ноды

```typescript
interface NodeDef {
  /** Тип ноды (discriminator). Уникальный в registry. */
  type: string

  /** Отображаемое имя */
  displayName: string

  /** Иконка (emoji) */
  icon?: string

  /** Цвет заголовка (hex) */
  color?: string

  /** Категория для группировки в палитре */
  category?: string

  /** Описание */
  description?: string

  /** Статические порты (всегда присутствуют) */
  ports: PortDef[]

  /** Динамические порты — вычисляются из data ноды.
   *  Вызывается при каждом изменении data.
   *  Результат ДОБАВЛЯЕТСЯ к статическим портам. */
  dynamicPorts?: (data: Record<string, unknown>) => PortDef[]

  /** Дефолтные данные при создании инстанса */
  defaultData?: Record<string, unknown>

  /** React компонент для кастомного тела ноды (опционально).
   *  Если не задан — рендерится дефолтный (subtitle, preview). */
  bodyComponent?: React.ComponentType<NodeBodyProps>

  /** React компонент для inspector (опционально).
   *  Если не задан — генерируется из data полей. */
  inspectorComponent?: React.ComponentType<NodeInspectorProps>
}
```

### PortDef — определение порта

```typescript
interface PortDef {
  /** Уникальный ID порта в рамках ноды */
  id: string

  /** Отображаемое имя */
  name: string

  /** Направление */
  direction: 'in' | 'out'

  /** Тип данных (опционально). 'string', 'number', 'any', 'flow', кастомный.
   *  Если не задан — 'any', подключается ко всему. */
  type?: string

  /** Разрешить несколько подключений к одному порту */
  multiple?: boolean

  /** Значение по умолчанию когда не подключено */
  default?: unknown
}
```

### NodeGraph — граф инстансов

```typescript
interface Position {
  x: number
  y: number
}

interface GraphNode {
  /** Уникальный ID инстанса */
  id: string

  /** Тип ноды (ссылка на NodeDef.type) */
  type: string

  /** Имя инстанса (опционально) */
  name?: string

  /** Позиция на canvas */
  position: Position

  /** Данные ноды */
  data: Record<string, unknown>
}

interface PortRef {
  node: string   // node id
  port: string   // port id
}

interface Connection {
  id: string
  from: PortRef
  to: PortRef
}

interface NodeGraph {
  version: number
  name: string
  nodes: GraphNode[]
  connections: Connection[]
  /** Произвольные метаданные графа */
  meta?: Record<string, unknown>
}
```

### NodeRegistry

```typescript
class NodeRegistry {
  /** Регистрация прототипа */
  register(def: NodeDef): void

  /** Получить прототип по типу */
  get(type: string): NodeDef | undefined

  /** Все зарегистрированные типы */
  getAll(): NodeDef[]

  /** Типы по категории */
  getByCategory(category: string): NodeDef[]

  /** Категории */
  getCategories(): string[]

  /** Создать инстанс с дефолтными данными */
  createNode(type: string, position: Position): GraphNode
}
```

`createNode` генерирует id (CVCVCV паттерн из core/id), устанавливает defaultData.

### GraphOps — операции над графом

Чистые функции. Immutable — возвращают новый граф.

```typescript
/** Добавить ноду. Возвращает [новый граф, id ноды]. */
function addNode(graph: NodeGraph, node: GraphNode): [NodeGraph, string]

/** Удалить ноду и все её связи. */
function removeNode(graph: NodeGraph, nodeId: string): NodeGraph

/** Обновить данные ноды. */
function updateNode(graph: NodeGraph, nodeId: string, updates: Partial<GraphNode>): NodeGraph

/** Обновить data ноды (merge). */
function updateNodeData(graph: NodeGraph, nodeId: string, data: Record<string, unknown>): NodeGraph

/** Переместить ноду. */
function moveNode(graph: NodeGraph, nodeId: string, position: Position): NodeGraph

/** Добавить связь. Возвращает [новый граф, id связи] или [граф, null] при ошибке.
 *  Если порт не multiple — перезаписывает существующую связь. */
function addConnection(graph: NodeGraph, from: PortRef, to: PortRef, registry: NodeRegistry): [NodeGraph, string | null]

/** Удалить связь. */
function removeConnection(graph: NodeGraph, connectionId: string): NodeGraph

/** Получить все связи к/от ноды. */
function getConnections(graph: NodeGraph, nodeId: string, direction?: 'in' | 'out'): Connection[]

/** Получить связи к конкретному порту. */
function getPortConnections(graph: NodeGraph, nodeId: string, portId: string): Connection[]

/** Topological sort. Возвращает null при цикле. */
function topologicalSort(graph: NodeGraph): string[] | null

/** Валидация связи перед созданием. */
function validateConnection(
  graph: NodeGraph,
  from: PortRef,
  to: PortRef,
  registry: NodeRegistry
): { valid: boolean; message?: string }
```

**Валидация связи:**
1. Направление: from.port = out, to.port = in
2. Не к себе: from.node ≠ to.node
3. Типы: если оба порта имеют type — проверить совместимость. 'any' совместим со всем. Одинаковые типы совместимы. Иначе warning (не error — LLM-first подход).
4. Multiple: если to port не multiple — удалить существующую связь к этому порту.

### Serialization

```typescript
/** Граф → JSON string */
function serializeGraph(graph: NodeGraph): string

/** JSON string → граф */
function deserializeGraph(json: string): NodeGraph
```

JSON — основной формат для lib. MD формат — задача потребителя (ngen имеет свой MD формат через core/ngen parse/serialize).

---

## @notreal/nodes — UI

### Принцип: Error Boundaries везде

**КРИТИЧНО.** Любой компонент который рендерит пользовательские данные или вызывает пользовательскую логику — оборачивается в error boundary.

```typescript
/** Error boundary для компонентов нод */
class NodeErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <div className="node-error">
        Error: {this.state.error.message}
        <button onClick={() => this.setState({ error: null })}>Retry</button>
      </div>
    }
    return this.props.children
  }
}
```

**Где оборачивать:**
- `NodeBody` — кастомный bodyComponent из NodeDef
- `Inspector` — inspectorComponent из NodeDef
- Любой callback из потребителя (onGenerate, onEvaluate, preview functions)
- Handlebars compile/render в ngen inspector

**Правило:** крэш в одной ноде не убивает редактор. Крэш в инспекторе показывает ошибку в инспекторе, не белый экран.

### Canvas

```typescript
interface CanvasProps {
  /** Граф для отображения */
  graph: NodeGraph

  /** Registry прототипов */
  registry: NodeRegistry

  /** Выбранные ноды */
  selectedNodes: string[]

  /** Выбранные связи */
  selectedConnections: string[]

  // Callbacks (все опциональные — readonly mode если не заданы)
  onNodeSelect?: (ids: string[]) => void
  onNodeMove?: (id: string, position: Position) => void
  onNodeDelete?: (ids: string[]) => void
  onConnectionCreate?: (from: PortRef, to: PortRef) => void
  onConnectionDelete?: (ids: string[]) => void
  onCanvasClick?: () => void  // click на пустое место (deselect)

  /** Кастомный рендер тела ноды. Если не задан — используется NodeDef.bodyComponent или дефолт. */
  renderNodeBody?: (node: GraphNode, def: NodeDef) => React.ReactNode

  /** Кастомный рендер preview под нодой */
  renderNodePreview?: (node: GraphNode, def: NodeDef) => React.ReactNode

  /** Readonly mode */
  readonly?: boolean
}
```

**Фичи Canvas:**
- Pan: middle mouse button или Space + drag
- Zoom: scroll wheel, zoom к курсору. Диапазон 0.25 — 2.0
- Grid: опционально, snap to grid
- Keyboard: Delete/Backspace — удалить выбранное, Escape — deselect
- Drag to connect: drag от output port → drop на input port
- Connection preview: bezier линия при drag
- Zoom controls: +, 1:1, −, процент

### NodeView

Рендерит одну ноду на canvas. Использует NodeDef для определения визуала.

```
┌──────────────────┐
│ 📋 list_name   3 │  ← header: icon, name, count
├──────────────────┤
│ ○ input_1        │  ← input ports (left)
│ ○ input_2        │
│                ○ │  ← output port (right)
│ wtype: h         │  ← body (subtitle/preview)
└──────────────────┘
│ ▸ "Золотой меч"  │  ← preview (под нодой, опционально)
```

**Header:** icon + name + optional count badge.
**Ports:** input слева, output справа. Круг + label.
**Body:** дефолтный (subtitle строка) или кастомный (NodeDef.bodyComponent).
**Preview:** опционально, под нодой. Renderится через Canvas.renderNodePreview.

**Error boundary** вокруг body и preview.

### ConnectionView

SVG bezier curve между портами.

```typescript
interface ConnectionViewProps {
  from: Position
  to: Position
  selected?: boolean
  validation?: { valid: boolean; message?: string }
  onClick?: () => void
}
```

Цвет: нормальный (серый), selected (синий), warning (жёлтый), error (красный).

### InspectorShell

Контейнер для инспектора. Не знает про конкретные типы нод.

```typescript
interface InspectorShellProps {
  /** Выбранная нода (null = ничего не выбрано) */
  node: GraphNode | null

  /** Прототип выбранной ноды */
  def: NodeDef | null

  /** Граф (для контекста) */
  graph: NodeGraph

  /** Callback для обновления ноды */
  onUpdateNode: (id: string, updates: Partial<GraphNode>) => void

  /** Callback для обновления data ноды */
  onUpdateData: (id: string, data: Record<string, unknown>) => void

  /** Callback для удаления ноды */
  onDeleteNode: (id: string) => void
}
```

**Структура InspectorShell:**
1. Если node === null → "Select a node"
2. Общие поля: name (input)
3. **Error boundary**
4. Внутри boundary: NodeDef.inspectorComponent если есть, иначе — ничего (data отображается как JSON)
5. Metadata: node id, type, position

### Toolbar

```typescript
interface ToolbarProps {
  registry: NodeRegistry
  onAddNode: (type: string) => void
  onSave?: () => void
  onLoad?: () => void
  onClear?: () => void
  graphName?: string
  onNameChange?: (name: string) => void
  /** Дополнительные кнопки от потребителя */
  extra?: React.ReactNode
}
```

Рендерит кнопки для каждого типа из registry (группируя по category). + Save/Load/Clear.

### Hooks

#### useGraph

```typescript
interface UseGraphOptions {
  initial?: NodeGraph
  registry: NodeRegistry

  /** Автосохранение. Callback вызывается при каждом изменении графа.
   *  Потребитель решает куда сохранять (localStorage, файл, API). */
  onAutoSave?: (graph: NodeGraph) => void

  /** Интервал автосохранения в ms. Default: 1000 (1 сек после последнего изменения). */
  autoSaveDebounce?: number
}

function useGraph(options: UseGraphOptions): {
  graph: NodeGraph

  // Node operations
  addNode: (type: string, position: Position) => string
  removeNode: (id: string) => void
  updateNode: (id: string, updates: Partial<GraphNode>) => void
  updateNodeData: (id: string, data: Record<string, unknown>) => void
  moveNode: (id: string, position: Position) => void

  // Connection operations
  addConnection: (from: PortRef, to: PortRef) => string | null
  removeConnection: (id: string) => void
  getConnections: (nodeId: string, direction?: 'in' | 'out') => Connection[]

  // Graph operations
  setGraph: (graph: NodeGraph) => void
  clearGraph: () => void

  // Undo/redo
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean

  // Serialization
  toJSON: () => string
  fromJSON: (json: string) => void
}
```

**Undo/redo:** простой стек состояний. Каждая мутация пушит предыдущее состояние в undo stack. Max 50 состояний. Это простая реализация — массив NodeGraph snapshots.

**Автосохранение:** debounced callback. Не в библиотеке — потребитель передаёт `onAutoSave` и решает куда сохранять.

#### useSelection

```typescript
function useSelection(): {
  selectedNodes: string[]
  selectedConnections: string[]

  selectNode: (id: string, multi?: boolean) => void
  selectConnection: (id: string) => void
  deselectAll: () => void
  deleteSelected: (graph: NodeGraph) => NodeGraph  // возвращает новый граф без выбранных
}
```

---

## @notreal/nodes — Exports

```typescript
// package.json exports
{
  "./core": "./src/core/index.ts",    // Types, GraphOps, Registry, Serialization
  "./ui": "./src/ui/index.ts",        // Canvas, NodeView, Inspector, Toolbar, hooks
}
```

**./core — без React dependency:**

```typescript
// Types
export type { NodeDef, PortDef, NodeGraph, GraphNode, Connection, PortRef, Position }
export type { NodeBodyProps, NodeInspectorProps }

// Registry
export { NodeRegistry }

// Graph operations
export {
  addNode, removeNode, updateNode, updateNodeData, moveNode,
  addConnection, removeConnection, getConnections, getPortConnections,
  topologicalSort, validateConnection
}

// Serialization
export { serializeGraph, deserializeGraph }

// ID generation
export { generateId }
```

**./ui — React components + hooks:**

```typescript
// Components
export { Canvas } from './components/Canvas'
export { NodeView } from './components/NodeView'
export { ConnectionView } from './components/ConnectionView'
export { InspectorShell } from './components/InspectorShell'
export { Toolbar } from './components/Toolbar'
export { NodeErrorBoundary } from './components/ErrorBoundary'

// Hooks
export { useGraph } from './hooks/useGraph'
export { useSelection } from './hooks/useSelection'
```

---

## @notreal/nodes — Структура файлов

```
S:\libs\nodes\
├── src/
│   ├── core/
│   │   ├── index.ts           # Core exports
│   │   ├── types.ts           # All types
│   │   ├── registry.ts        # NodeRegistry
│   │   ├── graph-ops.ts       # Immutable graph operations
│   │   ├── validation.ts      # Connection validation
│   │   └── serialization.ts   # JSON serialize/deserialize
│   │
│   └── ui/
│       ├── index.ts           # UI exports
│       ├── components/
│       │   ├── Canvas.tsx      # Pan/zoom/drag canvas
│       │   ├── NodeView.tsx    # Single node render
│       │   ├── PortView.tsx    # Port circle + label
│       │   ├── ConnectionView.tsx  # SVG bezier
│       │   ├── ConnectionPreview.tsx
│       │   ├── InspectorShell.tsx
│       │   ├── Toolbar.tsx
│       │   └── ErrorBoundary.tsx
│       ├── hooks/
│       │   ├── useGraph.ts     # Graph state + operations + undo + autosave
│       │   └── useSelection.ts
│       └── styles/
│           └── nodes.css       # Стили для всех компонентов
│
├── package.json
├── tsconfig.json
├── vite.config.ts              # preserveSymlinks: true
└── docs/
    └── specs/
        └── spec-nodes-v2.md    # Этот файл
```

---

## Namegen Editor — Приложение

### Архитектура

```
namegen editor
├── imports @notreal/nodes/core   — типы, registry, graph ops
├── imports @notreal/nodes/ui     — Canvas, Inspector, Toolbar, hooks
├── imports @notreal/core/ngen    — generate, parseNgen, serializeNgen, morphology
│
├── node-defs/                    — NodeDef для каждого типа ngen ноды
│   ├── list.ts                   — ListNodeDef + ListInspector
│   ├── union.ts                  — UnionNodeDef + UnionInspector
│   ├── template.ts               — TemplateNodeDef + TemplateInspector
│   ├── sample.ts                 — SampleNodeDef + SampleInspector
│   ├── output.ts                 — OutputNodeDef + OutputInspector
│   └── reference.ts              — ReferenceNodeDef + ReferenceInspector
│
├── bridge.ts                     — Конвертация nodes NodeGraph ↔ ngen NgenGraph
├── execution.ts                  — Вызов core/ngen generate() из графа
└── App.tsx                       — Приложение
```

### Node Definitions

Каждый ngen тип регистрируется как NodeDef.

#### ListNodeDef

```typescript
const ListNodeDef: NodeDef = {
  type: 'ngen:list',
  displayName: 'List',
  icon: '📋',
  color: '#4a9eff',
  category: 'Sources',
  ports: [
    { id: 'output', name: 'output', direction: 'out', type: 'ngen:data' }
  ],
  defaultData: {
    items: [],
    wtype: '',
    attributes: {}
  },
  inspectorComponent: ListInspector
}
```

#### UnionNodeDef

```typescript
const UnionNodeDef: NodeDef = {
  type: 'ngen:union',
  displayName: 'Union',
  icon: '⊕',
  color: '#ff9f43',
  category: 'Combinators',
  ports: [
    { id: 'output', name: 'output', direction: 'out', type: 'ngen:data' }
  ],
  dynamicPorts: (data) => {
    // Минимум 2 входа, +1 пустой для нового подключения
    const inputCount = (data._connectedInputs as number) || 2
    return Array.from({ length: inputCount + 1 }, (_, i) => ({
      id: `input_${i}`,
      name: `input ${i + 1}`,
      direction: 'in' as const,
      type: 'ngen:data',
      multiple: false,
    }))
  },
  defaultData: { mode: 'combine', distribution: 'by_element' },
  inspectorComponent: UnionInspector
}
```

#### TemplateNodeDef

```typescript
const TemplateNodeDef: NodeDef = {
  type: 'ngen:template',
  displayName: 'Template',
  icon: '📝',
  color: '#a55eea',
  category: 'Combinators',
  ports: [
    { id: 'output', name: 'output', direction: 'out', type: 'ngen:data' }
  ],
  dynamicPorts: (data) => {
    const inputs = (data.inputs as Array<{ id: string; name: string }>) || []
    return inputs.map(inp => ({
      id: inp.id,
      name: inp.name,
      direction: 'in' as const,
      type: 'ngen:data',
    }))
  },
  defaultData: { template: '', inputs: [], outputs: undefined },
  inspectorComponent: TemplateInspector
}
```

#### SampleNodeDef

```typescript
const SampleNodeDef: NodeDef = {
  type: 'ngen:sample',
  displayName: 'Sample',
  icon: '🎲',
  color: '#2ed573',
  category: 'Combinators',
  ports: [
    { id: 'input', name: 'input', direction: 'in', type: 'ngen:data' },
    { id: 'output', name: 'output', direction: 'out', type: 'ngen:data' }
  ],
  defaultData: { count: 5, seed: undefined },
  inspectorComponent: SampleInspector
}
```

#### OutputNodeDef

```typescript
const OutputNodeDef: NodeDef = {
  type: 'ngen:output',
  displayName: 'Output',
  icon: '📤',
  color: '#ff6b6b',
  category: 'Output',
  ports: [
    { id: 'input', name: 'input', direction: 'in', type: 'ngen:data' }
  ],
  defaultData: { seed: 42, count: 5 },
  inspectorComponent: OutputInspector
}
```

### Inspectors

**Каждый inspector — простой React компонент.** Получает node data, отдаёт onChange. Никакого взаимодействия с движком внутри inspector. Inspector — чистый UI.

**Критичная безопасность:** Inspector не вызывает generate(), не компилирует Handlebars, не делает ничего что может кинуть exception кроме рендера форм-контролов.

```typescript
interface NodeInspectorProps {
  node: GraphNode
  def: NodeDef
  graph: NodeGraph
  onChange: (data: Record<string, unknown>) => void
}
```

#### ListInspector

- Name (input)
- Word Type dropdown: none, h, s, o, m
- Items textarea (one per line)
- Items count display
- Custom attributes (key-value pairs)

#### UnionInspector

- Mode dropdown: combine / weighted
- Distribution dropdown (если weighted): by_element / by_group / custom
- Weights per input (если custom)

#### TemplateInspector

- Toggle: single / multi-output
- Template input (single mode) или output name + template pairs (multi mode)
- Inputs list: name + remove button + add button
- **Template input = обычный text input.** Не live preview, не Handlebars compile на каждый keystroke. Preview отображается на ноде на canvas, вычисляется через debounced safe call.

#### SampleInspector

- Count (number input)
- Seed (number input + 🎲 randomize button)

#### OutputInspector

- Seed (number + 🎲)
- Count (number)
- Input source (read-only, определяется connection)
- **Generate button** → результаты
- Results list

### Bridge: NodeGraph ↔ NgenGraph

nodes lib работает с `NodeGraph` (свой формат). core/ngen работает с `NgenGraph` (свой формат). Нужен маппинг.

```typescript
/** Конвертировать NodeGraph (nodes lib) → NgenGraph (core/ngen) */
function toNgenGraph(graph: NodeGraph, registry: NodeRegistry): NgenGraph

/** Конвертировать NgenGraph (core/ngen) → NodeGraph (nodes lib) */
function fromNgenGraph(ngenGraph: NgenGraph, registry: NodeRegistry): NodeGraph
```

**Маппинг:**

| NodeGraph | NgenGraph | Примечание |
|--|--|--|
| GraphNode.type | NgenNode.type | 'ngen:list' → 'list' |
| GraphNode.data | NgenNode.data | as-is |
| Connection.from/to (PortRef) | NgenConnection.from/to/toPort | flatten |
| GraphNode.position | NgenNode.position | as-is |

### Execution

```typescript
/** Safe execution wrapper.
 *  Конвертирует NodeGraph → NgenGraph, вызывает generate(), ловит ошибки. */
function safeGenerate(
  graph: NodeGraph,
  registry: NodeRegistry,
  options?: GenerateOptions
): { results: string[]; errors: string[] }
```

Всё в try-catch. Ошибки — в массив, не в exception. UI показывает ошибки рядом с результатами.

### Preview

Каждая нода на canvas может показывать preview — один результат генерации. Вычисляется debounced (300ms после последнего изменения графа).

```typescript
/** Safe preview для одной ноды.
 *  Возвращает строку или null при ошибке.
 *  Никогда не кидает exception. */
function safePreview(
  graph: NodeGraph,
  nodeId: string,
  registry: NodeRegistry
): string | null
```

### Save / Load

**Формат:** ngen MD (через core/ngen serializeNgen / parseNgen).

**Save:** граф → toNgenGraph → serializeNgen → download .md файл.
**Load:** upload .md файл → parseNgen → fromNgenGraph → setGraph.

**Автосохранение:** через useGraph onAutoSave → localStorage.

```typescript
const AUTOSAVE_KEY = 'namegen:autosave'

function App() {
  const { graph, setGraph, ...ops } = useGraph({
    registry,
    initial: loadAutoSave(),
    onAutoSave: (g) => localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(g)),
    autoSaveDebounce: 1000,
  })
}

function loadAutoSave(): NodeGraph | undefined {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    return saved ? JSON.parse(saved) : undefined
  } catch {
    return undefined
  }
}
```

### Namegen Editor — Структура файлов

```
S:\Projects\namegen\
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Главный компонент
│   │
│   ├── node-defs/                 # NodeDef + Inspector для каждого типа
│   │   ├── index.ts               # Регистрация всех нод
│   │   ├── list.ts
│   │   ├── union.ts
│   │   ├── template.ts
│   │   ├── sample.ts
│   │   ├── output.ts
│   │   └── reference.ts
│   │
│   ├── bridge.ts                  # NodeGraph ↔ NgenGraph конвертация
│   ├── execution.ts               # safeGenerate, safePreview
│   └── styles/
│       └── index.css              # Стили приложения (дополняют nodes.css)
│
├── playground/                    # Тестовые генераторы (.md файлы)
├── docs/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Namegen Editor — package.json

```json
{
  "name": "namegen",
  "version": "0.2.0",
  "type": "module",
  "dependencies": {
    "@notreal/core": "...",
    "@notreal/nodes": "...",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

---

## Важные решения

### 1. Error isolation

**Правило: код потребителя НИКОГДА не выполняется без try-catch.**

| Контекст | Где ловить | Что показывать |
|--|--|--|
| Inspector рендер | Error boundary вокруг inspectorComponent | "Error in inspector" + retry |
| Node body рендер | Error boundary вокруг bodyComponent | "Error" badge на ноде |
| Preview computation | try-catch в safePreview | Нет preview, нода рисуется нормально |
| Generation (Output) | try-catch в safeGenerate | Ошибки в results panel |
| Template compile | try-catch в safeGenerate | Ошибка в results, не крэш UI |
| Save/Load | try-catch | Alert/error message |

### 2. Два формата графа

NodeGraph (nodes lib) — generic, для визуала. NgenGraph (core/ngen) — specific, для генерации. Bridge конвертирует туда-сюда. Это правильно потому что:
- nodes lib не знает про ngen
- core/ngen не знает про nodes lib
- Потребитель (namegen editor) знает про оба и связывает

### 3. Execution — вне lib

nodes lib не знает как исполнять граф. Он знает как его отображать, редактировать, сериализовать. Потребитель решает что делать с графом — генерировать текст, вызывать LLM, переключать состояния.

### 4. Автосохранение через callback

Lib не лезет в localStorage. Lib вызывает `onAutoSave(graph)`. Потребитель решает куда: localStorage для браузера, файл для десктопа, API для сервера.

### 5. Стили

nodes lib экспортирует `nodes.css` с базовыми стилями. Потребитель может переопределить через CSS specificity. Классы с префиксом `nn-` (notreal-nodes).

---

## Тесты

### @notreal/nodes core

1. NodeRegistry: register, get, getAll, getByCategory, createNode
2. GraphOps: addNode, removeNode, updateNode, moveNode
3. GraphOps: addConnection, removeConnection, validation
4. GraphOps: topologicalSort (normal, cycle detection)
5. GraphOps: single-input port overwrites existing connection
6. Serialization: serialize → deserialize round-trip

### namegen editor

7. Bridge: toNgenGraph → fromNgenGraph round-trip
8. Bridge: node type mapping ('ngen:list' ↔ 'list')
9. safeGenerate: normal operation
10. safeGenerate: error handling (invalid template, cycle)
11. safePreview: returns string or null, never throws

---

## Порядок реализации

**Одна задача, один запуск Claude Code.**

1. @notreal/nodes/core — типы, registry, graph-ops, validation, serialization
2. @notreal/nodes/ui — Canvas, NodeView, PortView, ConnectionView, InspectorShell, Toolbar, ErrorBoundary, hooks, CSS
3. namegen node-defs — ListNodeDef+Inspector, UnionNodeDef+Inspector, TemplateNodeDef+Inspector, SampleNodeDef+Inspector, OutputNodeDef+Inspector, ReferenceNodeDef+Inspector
4. namegen bridge — NodeGraph ↔ NgenGraph
5. namegen execution — safeGenerate, safePreview
6. namegen App.tsx — собрать всё вместе, save/load, autosave
7. Тесты — core тесты + bridge тесты + execution тесты
8. Build + verify — typecheck, тесты, запуск в браузере

**Проверка:** открыть редактор, загрузить playground/Example Generator.md, увидеть граф, отредактировать, сгенерировать результат, сохранить. Ввести невалидный template — инспектор показывает ошибку, не крашится.

---

## Что НЕ делаем сейчас

- Undo/redo (заложено в useGraph, реализация позже)
- Minimap
- Multi-select (shift+click)
- Copy/paste нод
- Grid snap
- Комментарии на canvas
- Execution flow (для Bolt/оркестратора — потом)
- State graph визуал (для стейт машин — потом)
