import type { CanvasAlignment, CanvasDistribution, CanvasEdge, CanvasNode, CanvasSelection, CanvasShape, CanvasTool, JsonCanvasDocument } from './types'

const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 88
const DEFAULT_DIAMOND_WIDTH = 240
const DEFAULT_DIAMOND_HEIGHT = 160
const DEFAULT_ELLIPSE_SIZE = 160
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
    edges: document.edges.map((edge) => ({ ...edge, fromPoint: edge.fromPoint ? { ...edge.fromPoint } : undefined, toPoint: edge.toPoint ? { ...edge.toPoint } : undefined, style: edge.style ? { ...edge.style } : undefined, waypoints: edge.waypoints?.map((point) => ({ ...point })) })) as Array<CanvasEdge<EdgeExtra>>,
  }
}

export function shapeForTool(tool: CanvasTool): CanvasShape {
  if (tool === 'text') return 'text'
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
  const shape = partial.shape ?? (type === 'group' ? 'rounded-rectangle' : 'rounded-rectangle')
  const width = partial.width ?? (type === 'group' ? 360 : shape === 'diamond' ? DEFAULT_DIAMOND_WIDTH : shape === 'ellipse' ? DEFAULT_ELLIPSE_SIZE : DEFAULT_NODE_WIDTH)
  const height = partial.height ?? (type === 'group' ? 240 : shape === 'diamond' ? DEFAULT_DIAMOND_HEIGHT : shape === 'ellipse' ? DEFAULT_ELLIPSE_SIZE : DEFAULT_NODE_HEIGHT)
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
    shape,
    style: partial.style,
    groupId: partial.groupId,
    frame: partial.frame,
    locked: partial.locked,
    imageWidth: partial.imageWidth,
    imageHeight: partial.imageHeight,
    imageStatus: partial.imageStatus,
    imageError: partial.imageError,
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
    fromPoint: partial.fromPoint ? { ...partial.fromPoint } : undefined,
    fromSide: partial.fromAnchor?.side ?? partial.fromSide,
    fromAnchor: partial.fromAnchor,
    toPoint: partial.toPoint ? { ...partial.toPoint } : undefined,
    toSide: partial.toAnchor?.side ?? partial.toSide,
    toAnchor: partial.toAnchor,
    fromEnd: partial.fromEnd ?? 'none',
    toEnd: partial.toEnd ?? 'arrow',
    label: partial.label,
    color: partial.color,
    style: partial.style,
    waypoints: partial.waypoints?.map((point) => ({ ...point })),
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
  for (const node of document.nodes) {
    if (node.groupId && nodeIds.has(node.groupId)) nodeIds.add(node.id)
  }
  const edgeIds = new Set(selection.edgeIds)
  return {
    nodes: document.nodes.filter((node) => node.locked || !nodeIds.has(node.id)),
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
      waypoints: edge.waypoints?.map((point) => ({ ...point })),
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

function selectedNodes<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): Array<CanvasNode<NodeExtra>> {
  return document.nodes.filter((node) => selection.nodeIds.includes(node.id))
}

function nodeBounds(nodes: Array<Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>>) {
  const minX = Math.min(...nodes.map((node) => node.x))
  const minY = Math.min(...nodes.map((node) => node.y))
  const maxX = Math.max(...nodes.map((node) => node.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.y + node.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function createGroupLikeSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
  options: { frame?: boolean } = {},
): { document: JsonCanvasDocument<NodeExtra, EdgeExtra>; selection: CanvasSelection; group: CanvasNode<NodeExtra> | null } {
  const nodes = selectedNodes(document, selection).filter((node) => node.type !== 'group')
  if (nodes.length < 2) return { document, selection, group: null }
  const bounds = nodeBounds(nodes)
  const padding = options.frame ? 48 : 32
  const group = createCanvasNode<NodeExtra>({
    id: createId(options.frame ? 'frame' : 'group'),
    type: 'group',
    frame: options.frame,
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
    label: options.frame ? 'Frame' : 'Group',
    style: options.frame ? { strokeWidth: 1.5, opacity: 0.78 } : { strokeStyle: 'dashed', opacity: 0.72 },
  } as Partial<CanvasNode<NodeExtra>>)
  const firstSelectedIndex = document.nodes.findIndex((node) => selection.nodeIds.includes(node.id))
  const nextNodes = document.nodes.map((node) => (
    selection.nodeIds.includes(node.id) && node.type !== 'group'
      ? ({ ...node, groupId: group.id } as CanvasNode<NodeExtra>)
      : node
  ))
  nextNodes.splice(Math.max(firstSelectedIndex, 0), 0, group)
  return {
    document: { nodes: nextNodes, edges: document.edges },
    selection: { nodeIds: [group.id], edgeIds: [] },
    group,
  }
}

export function groupSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): { document: JsonCanvasDocument<NodeExtra, EdgeExtra>; selection: CanvasSelection; group: CanvasNode<NodeExtra> | null } {
  return createGroupLikeSelection(document, selection)
}

export function frameSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): { document: JsonCanvasDocument<NodeExtra, EdgeExtra>; selection: CanvasSelection; group: CanvasNode<NodeExtra> | null } {
  return createGroupLikeSelection(document, selection, { frame: true })
}

export function ungroupSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const groupIds = new Set(document.nodes.filter((node) => selection.nodeIds.includes(node.id) && node.type === 'group').map((node) => node.id))
  if (groupIds.size === 0) return document
  return {
    nodes: document.nodes
      .filter((node) => !groupIds.has(node.id))
      .map((node) => {
        if (!node.groupId || !groupIds.has(node.groupId)) return node
        const next = { ...node }
        delete next.groupId
        return next
      }),
    edges: document.edges,
  }
}

export function bringSelectionForward<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const selected = new Set(selection.nodeIds)
  const nodes = [...document.nodes]
  for (let index = nodes.length - 2; index >= 0; index -= 1) {
    const node = nodes[index]
    const next = nodes[index + 1]
    if (node && next && selected.has(node.id) && !selected.has(next.id)) {
      nodes[index] = next
      nodes[index + 1] = node
    }
  }
  return { ...document, nodes }
}

export function sendSelectionBackward<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const selected = new Set(selection.nodeIds)
  const nodes = [...document.nodes]
  for (let index = 1; index < nodes.length; index += 1) {
    const node = nodes[index]
    const previous = nodes[index - 1]
    if (node && previous && selected.has(node.id) && !selected.has(previous.id)) {
      nodes[index - 1] = node
      nodes[index] = previous
    }
  }
  return { ...document, nodes }
}

export function bringSelectionToFront<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const selected = new Set(selection.nodeIds)
  return { ...document, nodes: [...document.nodes.filter((node) => !selected.has(node.id)), ...document.nodes.filter((node) => selected.has(node.id))] }
}

export function sendSelectionToBack<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const selected = new Set(selection.nodeIds)
  return { ...document, nodes: [...document.nodes.filter((node) => selected.has(node.id)), ...document.nodes.filter((node) => !selected.has(node.id))] }
}

export function alignSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
  alignment: CanvasAlignment,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const nodes = selectedNodes(document, selection)
  if (nodes.length < 2) return document
  const bounds = nodeBounds(nodes)
  const selected = new Set(selection.nodeIds)
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (!selected.has(node.id)) return node
      if (alignment === 'left') return { ...node, x: bounds.x }
      if (alignment === 'center') return { ...node, x: bounds.x + bounds.width / 2 - node.width / 2 }
      if (alignment === 'right') return { ...node, x: bounds.x + bounds.width - node.width }
      if (alignment === 'top') return { ...node, y: bounds.y }
      if (alignment === 'middle') return { ...node, y: bounds.y + bounds.height / 2 - node.height / 2 }
      return { ...node, y: bounds.y + bounds.height - node.height }
    }),
  }
}

export function distributeSelection<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  selection: CanvasSelection,
  distribution: CanvasDistribution,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const nodes = selectedNodes(document, selection)
  if (nodes.length < 3) return document
  const sorted = [...nodes].sort((a, b) => distribution === 'horizontal' ? a.x - b.x : a.y - b.y)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (!first || !last) return document
  const totalSize = sorted.reduce((sum, node) => sum + (distribution === 'horizontal' ? node.width : node.height), 0)
  const span = distribution === 'horizontal' ? last.x + last.width - first.x : last.y + last.height - first.y
  const gap = (span - totalSize) / (sorted.length - 1)
  const positions = new Map<string, number>()
  let cursor = distribution === 'horizontal' ? first.x : first.y
  for (const node of sorted) {
    positions.set(node.id, cursor)
    cursor += (distribution === 'horizontal' ? node.width : node.height) + gap
  }
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      const position = positions.get(node.id)
      if (position === undefined) return node
      return distribution === 'horizontal' ? { ...node, x: position } : { ...node, y: position }
    }),
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
