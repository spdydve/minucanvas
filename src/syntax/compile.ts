import { defaultEdgeConnection } from '../geometry'
import { createCanvasEdge, createCanvasNode } from '../model'
import type { CanvasEdge, CanvasNode, CanvasShape, JsonCanvasEdgeEnd } from '../types'
import { parseMinuDiagramSyntax } from './parse'
import type { MinuDiagramCompileOptions, MinuDiagramCompileResult, MinuDiagramConnection, MinuDiagramDiagnostic, MinuDiagramNode, ParsedMinuDiagram } from './types'

const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = 112
const TEXT_WIDTH = 200
const TEXT_HEIGHT = 72
const IMAGE_WIDTH = 320
const IMAGE_HEIGHT = 200
const DIAMOND_WIDTH = 240
const DIAMOND_HEIGHT = 160
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
  const gridSize = options.gridSize === false ? null : options.gridSize ?? 20
  const ranks = rankNodes(parsed)
  const nodePositions = placeNodes(parsed, ranks, origin, nodeGap, rankGap, gridSize)

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

  const nodeLookup = new Map(nodes.map((node) => [node.id, node]))
  const edges = parsed.connections.map((connection, index) => createEdge(connection, index, nodeLookup))
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
  if (shape === 'diamond') return { width: node.width ?? DIAMOND_WIDTH, height: node.height ?? DIAMOND_HEIGHT }
  if (shape === 'pill') return { width: node.width ?? 180, height: node.height ?? 84 }
  return { width: node.width ?? DEFAULT_WIDTH, height: node.height ?? DEFAULT_HEIGHT }
}

function createEdge(connection: MinuDiagramConnection, index: number, nodes: Map<string, CanvasNode>): CanvasEdge {
  const { fromNode, toNode, fromEnd, toEnd } = edgeDirection(connection)
  const from = nodes.get(fromNode)
  const to = nodes.get(toNode)
  const defaults = from && to ? defaultEdgeConnection(from, to) : undefined
  const fromSide = defaults?.fromSide ?? 'right'
  const toSide = defaults?.toSide ?? 'left'
  const partial: Partial<CanvasEdge> = {
    id: `edge-${index + 1}`,
    fromSide,
    toSide,
    fromAnchor: defaults?.fromAnchor ?? { side: fromSide, position: 0.5 },
    toAnchor: defaults?.toAnchor ?? { side: toSide, position: 0.5 },
    fromEnd,
    toEnd,
  }
  if (connection.label) partial.label = connection.label
  if (connection.color) partial.color = connection.color
  const style = { ...(defaults?.style ?? {}), ...(connection.style ?? {}) }
  if (Object.keys(style).length > 0) partial.style = style
  return createCanvasEdge(fromNode, toNode, partial)
}

function edgeDirection(connection: MinuDiagramConnection): { fromNode: string; toNode: string; fromEnd: JsonCanvasEdgeEnd; toEnd: JsonCanvasEdgeEnd } {
  if (connection.operator === '<') return { fromNode: connection.to, toNode: connection.from, fromEnd: 'none', toEnd: 'arrow' }
  if (connection.operator === '<>') return { fromNode: connection.from, toNode: connection.to, fromEnd: 'arrow', toEnd: 'arrow' }
  if (connection.operator === '-' || connection.operator === '--') return { fromNode: connection.from, toNode: connection.to, fromEnd: 'none', toEnd: 'none' }
  return { fromNode: connection.from, toNode: connection.to, fromEnd: 'none', toEnd: 'arrow' }
}

function rankNodes(parsed: ParsedMinuDiagram): Map<string, number> {
  const ranks = new Map(parsed.nodes.map((node) => [node.id, 0]))
  const dag = new Map<string, Set<string>>()

  for (const connection of parsed.connections) {
    const from = connection.operator === '<' ? connection.to : connection.from
    const to = connection.operator === '<' ? connection.from : connection.to
    if (from === to || pathExists(dag, to, from)) continue
    dag.set(from, new Set([...(dag.get(from) ?? []), to]))
  }

  for (let pass = 0; pass < parsed.nodes.length; pass += 1) {
    let changed = false
    for (const [from, targets] of dag) {
      for (const to of targets) {
        const nextRank = (ranks.get(from) ?? 0) + 1
        if (nextRank > (ranks.get(to) ?? 0)) {
          ranks.set(to, nextRank)
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return ranks
}

function pathExists(graph: Map<string, Set<string>>, from: string, to: string): boolean {
  const visited = new Set<string>()
  const stack = [from]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current)) continue
    if (current === to) return true
    visited.add(current)
    stack.push(...(graph.get(current) ?? []))
  }
  return false
}

function placeNodes(
  parsed: ParsedMinuDiagram,
  ranks: Map<string, number>,
  origin: { x: number; y: number },
  nodeGap: number,
  rankGap: number,
  gridSize: number | null,
): Map<string, { x: number; y: number }> {
  const byRank = new Map<number, MinuDiagramNode[]>()
  for (const node of parsed.nodes) {
    const rank = ranks.get(node.id) ?? 0
    byRank.set(rank, [...(byRank.get(rank) ?? []), node])
  }
  const allSizes = parsed.nodes.map(estimatedNodeSize)
  const laneHeight = Math.max(DEFAULT_HEIGHT, ...allSizes.map((size) => size.height))
  const laneWidth = Math.max(DEFAULT_WIDTH, ...allSizes.map((size) => size.width))
  const snapCenter = (value: number) => gridSize ? Math.round(value / gridSize) * gridSize : value
  const primaryStep = snapCenter(DEFAULT_WIDTH + rankGap)
  const secondaryStep = snapCenter(laneHeight + nodeGap)
  const baseCenter = {
    x: snapCenter(origin.x + laneWidth / 2),
    y: snapCenter(origin.y + laneHeight / 2),
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const [rank, nodes] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    const sizes = nodes.map(estimatedNodeSize)
    nodes.forEach((node, index) => {
      const size = sizes[index] ?? { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
      const primary = rank * primaryStep
      const secondary = index * secondaryStep
      const center = {
        x: parsed.direction === 'left'
          ? baseCenter.x - primary
          : parsed.direction === 'right'
            ? baseCenter.x + primary
            : baseCenter.x + secondary,
        y: parsed.direction === 'up'
          ? baseCenter.y - primary
          : parsed.direction === 'down'
            ? baseCenter.y + primary
            : baseCenter.y + secondary,
      }
      positions.set(node.id, { x: center.x - size.width / 2, y: center.y - size.height / 2 })
    })
  }
  return positions
}

function estimatedNodeSize(node: MinuDiagramNode): { width: number; height: number } {
  const type = node.type ?? typeForNode(node)
  const shape = node.type === 'image' || node.type === 'link' ? 'text' : node.shape ? (SHAPE_ALIASES[node.shape] ?? 'rounded-rectangle') : 'rounded-rectangle'
  return sizeForNode(node, type, shape)
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
