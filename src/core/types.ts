// ============================================================================
// @notreal/nodes v2 — Core Types
// ============================================================================

import type { ComponentType } from 'react'

// ============================================================================
// Port Types
// ============================================================================

export interface PortDef {
  /** Unique port ID within node */
  id: string

  /** Display name */
  name: string

  /** Direction */
  direction: 'in' | 'out'

  /** Data type. 'any' matches everything. Same types are compatible. */
  type?: string

  /** Allow multiple connections to this port */
  multiple?: boolean

  /** Default value when not connected */
  default?: unknown
}

// ============================================================================
// Node Types
// ============================================================================

export interface NodeBodyProps {
  node: GraphNode
  def: NodeDef
  graph: NodeGraph
}

export interface NodeInspectorProps {
  node: GraphNode
  def: NodeDef
  graph: NodeGraph
  onChange: (data: Record<string, unknown>) => void
}

export interface NodeDef {
  /** Node type (discriminator). Unique in registry. */
  type: string

  /** Display name */
  displayName: string

  /** Icon (emoji) */
  icon?: string

  /** Header color (hex) */
  color?: string

  /** Category for grouping in palette */
  category?: string

  /** Description */
  description?: string

  /** Static ports (always present) */
  ports: PortDef[]

  /** Dynamic ports — computed from node data.
   *  Called on every data change.
   *  Result is ADDED to static ports. */
  dynamicPorts?: (data: Record<string, unknown>) => PortDef[]

  /** Default data when creating an instance */
  defaultData?: Record<string, unknown>

  /** Custom React component for node body (optional) */
  bodyComponent?: ComponentType<NodeBodyProps>

  /** Custom React component for inspector (optional) */
  inspectorComponent?: ComponentType<NodeInspectorProps>
}

// ============================================================================
// Graph Instance Types
// ============================================================================

export interface Position {
  x: number
  y: number
}

export interface GraphNode {
  /** Unique instance ID */
  id: string

  /** Node type (reference to NodeDef.type) */
  type: string

  /** Instance name (optional) */
  name?: string

  /** Position on canvas */
  position: Position

  /** Node data */
  data: Record<string, unknown>
}

export interface PortRef {
  node: string   // node id
  port: string   // port id
}

export interface Connection {
  id: string
  from: PortRef
  to: PortRef
}

export interface NodeGraph {
  version: number
  name: string
  nodes: GraphNode[]
  connections: Connection[]
  /** Arbitrary graph metadata */
  meta?: Record<string, unknown>
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ConnectionValidationResult {
  valid: boolean
  message?: string
}

// ============================================================================
// UI State Types
// ============================================================================

export interface ViewState {
  pan: Position
  zoom: number
}
