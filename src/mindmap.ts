import { defaultEdgeAnchorForSide } from './geometry'
import { createCanvasNode } from './model'
import type { CanvasEdge, CanvasNode, CanvasEdgeRouting, JsonCanvasDocument, JsonCanvasEdgeEnd, JsonCanvasSide } from './types'

export type MindMapSide = 'left' | 'right'
export type MindMapEdgeEnds = 'none' | 'preserve'

export interface MindMapLayoutOptions {
  rootId?: string | undefined
  origin?: { x: number; y: number } | undefined
  horizontalGap?: number | undefined
  verticalGap?: number | undefined
  gridSize?: number | false | undefined
  splitRootChildren?: boolean | undefined
  edgeRouting?: CanvasEdgeRouting | 'preserve' | undefined
  edgeEnds?: MindMapEdgeEnds | undefined
}

export interface MindMapDefaultDocumentOptions {
  rootId?: string | undefined
  rootText?: string | undefined
  x?: number | undefined
  y?: number | undefined
  width?: number | undefined
  height?: number | undefined
}

export type MindMapProfileOptions = MindMapLayoutOptions & MindMapDefaultDocumentOptions

interface MindMapNodePlacement {
  node: CanvasNode
  center: { x: number; y: number }
}

const DEFAULT_HORIZONTAL_GAP = 120
const DEFAULT_VERTICAL_GAP = 28
const DEFAULT_GRID_SIZE = 20
const DEFAULT_ROOT_ID = 'root'
const DEFAULT_ROOT_TEXT = 'Central topic'
const DEFAULT_ROOT_X = 14
const DEFAULT_ROOT_Y = 62
const DEFAULT_ROOT_WIDTH = 132
const DEFAULT_ROOT_HEIGHT = 36

export function createDefaultMindMapDocument<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(
  options: MindMapDefaultDocumentOptions = {},
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  return {
    nodes: [createCanvasNode<NodeExtra>({
      id: options.rootId ?? DEFAULT_ROOT_ID,
      type: 'text',
      text: options.rootText ?? DEFAULT_ROOT_TEXT,
      shape: 'text',
      x: options.x ?? DEFAULT_ROOT_X,
      y: options.y ?? DEFAULT_ROOT_Y,
      width: options.width ?? DEFAULT_ROOT_WIDTH,
      height: options.height ?? DEFAULT_ROOT_HEIGHT,
    } as Partial<CanvasNode<NodeExtra>>)],
    edges: [],
  }
}

function nodeCenter(node: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

function snap(value: number, gridSize: number | null): number {
  return gridSize ? Math.round(value / gridSize) * gridSize : value
}

function chooseRoot(nodes: CanvasNode[], edges: CanvasEdge[], rootId?: string): CanvasNode | null {
  if (rootId) return nodes.find((node) => node.id === rootId) ?? null
  const incoming = new Set(edges.map((edge) => edge.toNode))
  return nodes.find((node) => !incoming.has(node.id)) ?? nodes[0] ?? null
}

function buildChildren(edges: CanvasEdge[], nodeIds: Set<string>): Map<string, string[]> {
  const children = new Map<string, string[]>()
  const assignedParents = new Set<string>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) continue
    if (edge.fromNode === edge.toNode || assignedParents.has(edge.toNode)) continue
    children.set(edge.fromNode, [...(children.get(edge.fromNode) ?? []), edge.toNode])
    assignedParents.add(edge.toNode)
  }
  return children
}

function splitChildren(childIds: string[], splitRootChildren: boolean, nodesById: Map<string, CanvasNode>, rootNode: CanvasNode, rootCenter: { x: number; y: number }): { left: string[]; right: string[] } {
  if (!splitRootChildren) return { left: [], right: childIds }
  const right: string[] = []
  const left: string[] = []
  const unplaced: string[] = []
  for (const childId of childIds) {
    const child = nodesById.get(childId)
    if (!child) continue
    const center = nodeCenter(child)
    if (Math.abs(child.x - rootNode.x) <= 1) unplaced.push(childId)
    else if (center.x < rootCenter.x - 1) left.push(childId)
    else if (center.x > rootCenter.x + 1) right.push(childId)
    else unplaced.push(childId)
  }
  const startRight = right.length <= left.length
  unplaced.forEach((childId, index) => {
    if ((index % 2 === 0) === startRight) right.push(childId)
    else left.push(childId)
  })
  return { left, right }
}

export function layoutMindMap<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  options: MindMapLayoutOptions = {},
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const nodesById = new Map(document.nodes.map((node) => [node.id, node]))
  const root = chooseRoot(document.nodes, document.edges, options.rootId)
  if (!root) return document

  const gridSize = options.gridSize === false ? null : options.gridSize ?? DEFAULT_GRID_SIZE
  const horizontalGap = options.horizontalGap ?? DEFAULT_HORIZONTAL_GAP
  const verticalGap = options.verticalGap ?? DEFAULT_VERTICAL_GAP
  const rootCenter = options.origin ?? nodeCenter(root)
  const children = buildChildren(document.edges, new Set(document.nodes.map((node) => node.id)))
  const subtreeHeightMemo = new Map<string, number>()

  const subtreeHeight = (nodeId: string, seen = new Set<string>()): number => {
    const node = nodesById.get(nodeId)
    if (!node || seen.has(nodeId)) return 0
    const childIds = children.get(nodeId) ?? []
    if (childIds.length === 0) return node.height
    const cached = subtreeHeightMemo.get(nodeId)
    if (cached !== undefined) return cached
    const nextSeen = new Set(seen).add(nodeId)
    const childrenHeight = childIds.reduce((sum, childId) => sum + subtreeHeight(childId, nextSeen), 0) + Math.max(0, childIds.length - 1) * verticalGap
    const height = Math.max(node.height, childrenHeight)
    subtreeHeightMemo.set(nodeId, height)
    return height
  }

  const placements = new Map<string, MindMapNodePlacement>()
  placements.set(root.id, { node: root, center: { x: snap(rootCenter.x, gridSize), y: snap(rootCenter.y, gridSize) } })

  const placeChildren = (parentId: string, parentCenter: { x: number; y: number }, side: MindMapSide, childIds: string[], seen = new Set<string>()) => {
    if (seen.has(parentId)) return
    const blocks = childIds.map((childId) => ({ id: childId, height: subtreeHeight(childId, new Set(seen).add(parentId)) }))
    const totalHeight = blocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, blocks.length - 1) * verticalGap
    let cursorY = parentCenter.y - totalHeight / 2

    for (const block of blocks) {
      const child = nodesById.get(block.id)
      const parent = nodesById.get(parentId)
      if (!child || !parent || seen.has(block.id)) continue
      const centerY = snap(cursorY + block.height / 2, gridSize)
      const centerX = side === 'right'
        ? snap(parentCenter.x + parent.width / 2 + horizontalGap + child.width / 2, gridSize)
        : snap(parentCenter.x - parent.width / 2 - horizontalGap - child.width / 2, gridSize)
      const center = { x: centerX, y: centerY }
      placements.set(child.id, { node: child, center })
      placeChildren(child.id, center, side, children.get(child.id) ?? [], new Set(seen).add(parentId))
      cursorY += block.height + verticalGap
    }
  }

  const rootChildren = children.get(root.id) ?? []
  const split = splitChildren(rootChildren, options.splitRootChildren ?? true, nodesById, root, placements.get(root.id)!.center)
  placeChildren(root.id, placements.get(root.id)!.center, 'right', split.right)
  placeChildren(root.id, placements.get(root.id)!.center, 'left', split.left)

  const placedNodes = document.nodes.map((node) => {
    const placement = placements.get(node.id)
    if (!placement) return node
    return {
      ...node,
      x: placement.center.x - node.width / 2,
      y: placement.center.y - node.height / 2,
    }
  })
  const placedNodeLookup = new Map(placedNodes.map((node) => [node.id, node]))
  const edgeRouting = options.edgeRouting ?? 'curved'
  const edgeEnds = options.edgeEnds ?? 'none'

  const placedEdges = document.edges.map((edge) => {
    const fromNode = placedNodeLookup.get(edge.fromNode)
    const toNode = placedNodeLookup.get(edge.toNode)
    if (!fromNode || !toNode) return edge
    const fromCenter = nodeCenter(fromNode)
    const toCenter = nodeCenter(toNode)
    const fromSide: JsonCanvasSide = toCenter.x < fromCenter.x ? 'left' : 'right'
    const toSide: JsonCanvasSide = fromSide === 'left' ? 'right' : 'left'
    const style = edgeRouting === 'preserve' ? edge.style : { ...(edge.style ?? {}), routing: edgeRouting }
    return {
      ...edge,
      fromSide,
      toSide,
      fromAnchor: defaultEdgeAnchorForSide(fromNode, fromSide),
      toAnchor: defaultEdgeAnchorForSide(toNode, toSide),
      ...(edgeEnds === 'none' ? { fromEnd: 'none' as JsonCanvasEdgeEnd, toEnd: 'none' as JsonCanvasEdgeEnd } : {}),
      ...(style && Object.keys(style).length > 0 ? { style } : {}),
    }
  })

  return { ...document, nodes: placedNodes, edges: placedEdges }
}
