import type { CanvasEdge, CanvasNode, CanvasSelection, CanvasShape, CanvasTool, JsonCanvasDocument } from './types'

const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 120
const DEFAULT_GRID_SIZE = 20

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyCanvas<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  return { nodes: [], edges: [] }
}

export function cloneCanvas<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  return {
    nodes: document.nodes.map((node) => ({ ...node, style: node.style ? { ...node.style } : undefined })) as Array<CanvasNode<NodeExtra>>,
    edges: document.edges.map((edge) => ({ ...edge, style: edge.style ? { ...edge.style } : undefined })) as Array<CanvasEdge<EdgeExtra>>,
  }
}

export function shapeForTool(tool: CanvasTool): CanvasShape {
  if (tool === 'diamond') return 'diamond'
  if (tool === 'ellipse') return 'ellipse'
  if (tool === 'pill') return 'pill'
  if (tool === 'rectangle') return 'rectangle'
  return 'rounded-rectangle'
}

export function nodeLabel(node: CanvasNode): string {
  if (node.text) return node.text
  if (node.label) return node.label
  if (node.file) return node.file.split('/').at(-1) ?? node.file
  if (node.url) return node.url
  return ''
}

export function createCanvasNode<NodeExtra extends Record<string, unknown> = Record<string, unknown>>(
  partial: Partial<CanvasNode<NodeExtra>>,
): CanvasNode<NodeExtra> {
  const type = partial.type ?? 'text'
  const width = partial.width ?? (type === 'group' ? 360 : DEFAULT_NODE_WIDTH)
  const height = partial.height ?? (type === 'group' ? 240 : DEFAULT_NODE_HEIGHT)
  const node = {
    id: partial.id ?? createId('node'),
    type,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width,
    height,
    text: partial.text,
    file: partial.file,
    url: partial.url,
    label: partial.label,
    color: partial.color,
    background: partial.background,
    shape: partial.shape ?? (type === 'group' ? 'rounded-rectangle' : 'rounded-rectangle'),
    style: partial.style,
  } as CanvasNode<NodeExtra>

  return node
}

export function createCanvasEdge<EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(
  fromNode: string,
  toNode: string,
  partial: Partial<CanvasEdge<EdgeExtra>> = {},
): CanvasEdge<EdgeExtra> {
  return {
    id: partial.id ?? createId('edge'),
    fromNode,
    toNode,
    fromSide: partial.fromAnchor?.side ?? partial.fromSide,
    fromAnchor: partial.fromAnchor,
    toSide: partial.toAnchor?.side ?? partial.toSide,
    toAnchor: partial.toAnchor,
    fromEnd: partial.fromEnd ?? 'none',
    toEnd: partial.toEnd ?? 'arrow',
    label: partial.label,
    color: partial.color,
    style: partial.style,
  } as CanvasEdge<EdgeExtra>
}

export function updateNode<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  nodeId: string,
  updater: (node: CanvasNode<NodeExtra>) => CanvasNode<NodeExtra>,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  return {
    ...document,
    nodes: document.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
  }
}

export function deleteSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const nodeIds = new Set(selection.nodeIds)
  const edgeIds = new Set(selection.edgeIds)
  return {
    nodes: document.nodes.filter((node) => !nodeIds.has(node.id)),
    edges: document.edges.filter(
      (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.fromNode) && !nodeIds.has(edge.toNode),
    ),
  }
}

export function duplicateSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): { document: JsonCanvasDocument<NodeExtra, EdgeExtra>; selection: CanvasSelection } {
  const selectedNodes = document.nodes.filter((node) => selection.nodeIds.includes(node.id))
  const idMap = new Map<string, string>()
  const nextNodes = selectedNodes.map((node) => {
    const id = createId('node')
    idMap.set(node.id, id)
    return {
      ...node,
      id,
      x: node.x + 40,
      y: node.y + 40,
      style: node.style ? { ...node.style } : undefined,
    } as CanvasNode<NodeExtra>
  })
  const nextEdges = document.edges
    .filter((edge) => idMap.has(edge.fromNode) && idMap.has(edge.toNode))
    .map((edge) => ({
      ...edge,
      id: createId('edge'),
      fromNode: idMap.get(edge.fromNode) ?? edge.fromNode,
      toNode: idMap.get(edge.toNode) ?? edge.toNode,
      style: edge.style ? { ...edge.style } : undefined,
    })) as Array<CanvasEdge<EdgeExtra>>

  return {
    document: {
      nodes: [...document.nodes, ...nextNodes],
      edges: [...document.edges, ...nextEdges],
    },
    selection: {
      nodeIds: nextNodes.map((node) => node.id),
      edgeIds: nextEdges.map((edge) => edge.id),
    },
  }
}

export function snap(value: number, gridSize = DEFAULT_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize
}

export function snapPoint(point: { x: number; y: number }, gridSize = DEFAULT_GRID_SIZE): { x: number; y: number } {
  return { x: snap(point.x, gridSize), y: snap(point.y, gridSize) }
}

export function normalizeSelection(selection: Partial<CanvasSelection> | undefined): CanvasSelection {
  return {
    nodeIds: selection?.nodeIds ?? [],
    edgeIds: selection?.edgeIds ?? [],
  }
}
