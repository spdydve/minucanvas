import { createCanvasEdge, createCanvasNode } from '../model'
import type { CanvasEdge, CanvasNode, CanvasShape, JsonCanvasEdgeEnd, JsonCanvasSide } from '../types'
import { parseMinuDiagramSyntax } from './parse'
import type { MinuDiagramCompileOptions, MinuDiagramCompileResult, MinuDiagramConnection, MinuDiagramDiagnostic, MinuDiagramNode, ParsedMinuDiagram } from './types'

const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 112
const TEXT_WIDTH = 200
const TEXT_HEIGHT = 72
const IMAGE_WIDTH = 320
const IMAGE_HEIGHT = 200
const GROUP_PADDING = 40

const SHAPE_ALIASES: Record<string, CanvasShape> = {
  text: 'text',
  rectangle: 'rectangle',
  rect: 'rectangle',
  rounded: 'rounded-rectangle',
  card: 'rounded-rectangle',
  pill: 'pill',
  oval: 'pill',
  diamond: 'diamond',
  decision: 'diamond',
  ellipse: 'ellipse',
  circle: 'ellipse',
  parallelogram: 'parallelogram',
  hexagon: 'hexagon',
}

export function compileMinuDiagramSyntax(source: string, options: MinuDiagramCompileOptions = {}): MinuDiagramCompileResult {
  return compileParsedMinuDiagram(parseMinuDiagramSyntax(source), options)
}

export function compileParsedMinuDiagram(parsed: ParsedMinuDiagram, options: MinuDiagramCompileOptions = {}): MinuDiagramCompileResult {
  const diagnostics: MinuDiagramDiagnostic[] = [...parsed.diagnostics]
  const origin = options.origin ?? { x: 80, y: 80 }
  const nodeGap = options.nodeGap ?? 56
  const rankGap = options.rankGap ?? 112
  const groupPadding = options.groupPadding ?? GROUP_PADDING
  const ranks = rankNodes(parsed)
  const nodePositions = placeNodes(parsed, ranks, origin, nodeGap, rankGap)

  const nodes: CanvasNode[] = []
  const groupNodes: CanvasNode[] = []

  for (const group of parsed.groups) {
    const partial: Partial<CanvasNode> = {
      id: group.id,
      type: 'group',
      label: group.label ?? group.id,
      x: origin.x,
      y: origin.y,
      width: 360,
      height: 240,
      style: { strokeStyle: 'dashed', opacity: 0.72, ...group.style },
    }
    if (group.color) partial.color = group.color
    if (group.parentGroupId) partial.groupId = group.parentGroupId
    groupNodes.push(createCanvasNode(partial))
  }

  for (const node of parsed.nodes) {
    nodes.push(createNode(node, nodePositions.get(node.id) ?? origin, diagnostics))
  }

  const edges = parsed.connections.map((connection, index) => createEdge(connection, index))
  const documentNodes = fitGroups([...groupNodes, ...nodes], groupPadding)
  return { document: { nodes: documentNodes, edges }, parsed, diagnostics }
}

function createNode(node: MinuDiagramNode, position: { x: number; y: number }, diagnostics: MinuDiagramDiagnostic[]): CanvasNode {
  const type = node.type ?? typeForNode(node)
  const shape = shapeForNode(node, diagnostics)
  const { width, height } = sizeForNode(node, type, shape)
  const partial: Partial<CanvasNode> = {
    id: node.id,
    type,
    x: position.x,
    y: position.y,
    width,
    height,
    shape,
  }
  if (type === 'text') partial.text = node.label ?? node.id
  const label = node.label ?? (type === 'link' || type === 'image' ? node.id : undefined)
  if (label) partial.label = label
  if (node.url) partial.url = node.url
  const file = node.file ?? (type === 'image' ? node.url : undefined)
  if (file) partial.file = file
  if (node.color) partial.color = node.color
  if (node.style) partial.style = node.style
  if (node.groupId) partial.groupId = node.groupId
  return createCanvasNode(partial)
}

function typeForNode(node: MinuDiagramNode): CanvasNode['type'] {
  if (node.url && !isImageUrl(node.url)) return 'link'
  if (node.url && isImageUrl(node.url)) return 'image'
  if (node.file && isImageUrl(node.file)) return 'image'
  return 'text'
}

function shapeForNode(node: MinuDiagramNode, diagnostics: MinuDiagramDiagnostic[]): CanvasShape {
  if (node.type === 'image' || node.type === 'link') return 'text'
  if (!node.shape) return 'rounded-rectangle'
  const shape = SHAPE_ALIASES[node.shape]
  if (shape) return shape
  diagnostics.push({ severity: 'warning', message: `Unsupported shape "${node.shape}" for node "${node.id}". Using rounded rectangle.`, line: node.line })
  return 'rounded-rectangle'
}

function sizeForNode(node: MinuDiagramNode, type: CanvasNode['type'], shape: CanvasShape): { width: number; height: number } {
  if (node.width && node.height) return { width: node.width, height: node.height }
  if (type === 'image') return { width: node.width ?? IMAGE_WIDTH, height: node.height ?? IMAGE_HEIGHT }
  if (shape === 'text') return { width: node.width ?? TEXT_WIDTH, height: node.height ?? TEXT_HEIGHT }
  if (shape === 'diamond') return { width: node.width ?? 160, height: node.height ?? 140 }
  if (shape === 'pill') return { width: node.width ?? 180, height: node.height ?? 84 }
  return { width: node.width ?? DEFAULT_WIDTH, height: node.height ?? DEFAULT_HEIGHT }
}

function createEdge(connection: MinuDiagramConnection, index: number): CanvasEdge {
  const { fromNode, toNode, fromEnd, toEnd } = edgeDirection(connection)
  const { fromSide, toSide } = sidePair(connection.operator)
  const partial: Partial<CanvasEdge> = {
    id: `edge-${index + 1}`,
    fromSide,
    toSide,
    fromAnchor: { side: fromSide, position: 0.5 },
    toAnchor: { side: toSide, position: 0.5 },
    fromEnd,
    toEnd,
  }
  if (connection.label) partial.label = connection.label
  if (connection.color) partial.color = connection.color
  if (connection.style) partial.style = connection.style
  return createCanvasEdge(fromNode, toNode, partial)
}

function edgeDirection(connection: MinuDiagramConnection): { fromNode: string; toNode: string; fromEnd: JsonCanvasEdgeEnd; toEnd: JsonCanvasEdgeEnd } {
  if (connection.operator === '<') return { fromNode: connection.to, toNode: connection.from, fromEnd: 'none', toEnd: 'arrow' }
  if (connection.operator === '<>') return { fromNode: connection.from, toNode: connection.to, fromEnd: 'arrow', toEnd: 'arrow' }
  if (connection.operator === '-' || connection.operator === '--') return { fromNode: connection.from, toNode: connection.to, fromEnd: 'none', toEnd: 'none' }
  return { fromNode: connection.from, toNode: connection.to, fromEnd: 'none', toEnd: 'arrow' }
}

function sidePair(_operator: MinuDiagramConnection['operator']): { fromSide: JsonCanvasSide; toSide: JsonCanvasSide } {
  return { fromSide: 'right', toSide: 'left' }
}

function rankNodes(parsed: ParsedMinuDiagram): Map<string, number> {
  const ranks = new Map(parsed.nodes.map((node) => [node.id, 0]))
  for (let pass = 0; pass < parsed.nodes.length; pass += 1) {
    let changed = false
    for (const connection of parsed.connections) {
      const from = connection.operator === '<' ? connection.to : connection.from
      const to = connection.operator === '<' ? connection.from : connection.to
      const nextRank = (ranks.get(from) ?? 0) + 1
      if (nextRank > (ranks.get(to) ?? 0)) {
        ranks.set(to, nextRank)
        changed = true
      }
    }
    if (!changed) break
  }
  return ranks
}

function placeNodes(
  parsed: ParsedMinuDiagram,
  ranks: Map<string, number>,
  origin: { x: number; y: number },
  nodeGap: number,
  rankGap: number,
): Map<string, { x: number; y: number }> {
  const byRank = new Map<number, MinuDiagramNode[]>()
  for (const node of parsed.nodes) {
    const rank = ranks.get(node.id) ?? 0
    byRank.set(rank, [...(byRank.get(rank) ?? []), node])
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const [rank, nodes] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    nodes.forEach((node, index) => {
      const primary = rank * (DEFAULT_WIDTH + rankGap)
      const secondary = index * (DEFAULT_HEIGHT + nodeGap)
      const x = parsed.direction === 'left' ? origin.x - primary : parsed.direction === 'right' ? origin.x + primary : origin.x + secondary
      const y = parsed.direction === 'up' ? origin.y - primary : parsed.direction === 'down' ? origin.y + primary : origin.y + secondary
      positions.set(node.id, { x, y })
    })
  }
  return positions
}

function fitGroups(nodes: CanvasNode[], padding: number): CanvasNode[] {
  return nodes.map((node) => {
    if (node.type !== 'group') return node
    const children = nodes.filter((candidate) => candidate.groupId === node.id && candidate.id !== node.id)
    if (children.length === 0) return node
    const minX = Math.min(...children.map((child) => child.x))
    const minY = Math.min(...children.map((child) => child.y))
    const maxX = Math.max(...children.map((child) => child.x + child.width))
    const maxY = Math.max(...children.map((child) => child.y + child.height))
    return { ...node, x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 }
  })
}

function isImageUrl(value: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value)
}
