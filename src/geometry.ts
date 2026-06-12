import type { CanvasEdge, CanvasEdgeAnchor, CanvasNode, CanvasViewport, JsonCanvasSide } from './types'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function clientToCanvas(client: Point, bounds: DOMRect, viewport: CanvasViewport): Point {
  return {
    x: (client.x - bounds.left - viewport.x) / viewport.zoom,
    y: (client.y - bounds.top - viewport.y) / viewport.zoom,
  }
}

export function nodeCenter(node: CanvasNode): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

export function sideForPoint(node: CanvasNode, point: Point): JsonCanvasSide {
  return edgeAnchorForPoint(node, point).side
}

export function sideFacingPoint(node: CanvasNode, point: Point): JsonCanvasSide {
  const center = nodeCenter(node)
  const dx = point.x - center.x
  const dy = point.y - center.y
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function snapMidpoint(position: number, sideLength: number, snapThreshold: number): number {
  const distanceToMiddle = Math.abs(position - 0.5) * sideLength
  return distanceToMiddle <= snapThreshold ? 0.5 : position
}

function rectangularEdgeAnchorForPoint(node: CanvasNode, point: Point, snapThreshold: number): CanvasEdgeAnchor {
  const distances: Array<{ side: JsonCanvasSide; distance: number }> = [
    { side: 'top', distance: Math.abs(point.y - node.y) },
    { side: 'right', distance: Math.abs(point.x - (node.x + node.width)) },
    { side: 'bottom', distance: Math.abs(point.y - (node.y + node.height)) },
    { side: 'left', distance: Math.abs(point.x - node.x) },
  ]
  distances.sort((a, b) => a.distance - b.distance)
  const side = distances[0]?.side ?? 'right'
  if (side === 'top' || side === 'bottom') {
    const raw = clamp((point.x - node.x) / node.width, 0, 1)
    return { side, position: snapMidpoint(raw, node.width, snapThreshold) }
  }
  const raw = clamp((point.y - node.y) / node.height, 0, 1)
  return { side, position: snapMidpoint(raw, node.height, snapThreshold) }
}

function pointOnSegment(start: Point, end: Point, position: number): Point {
  return {
    x: start.x + (end.x - start.x) * position,
    y: start.y + (end.y - start.y) * position,
  }
}

function closestPointOnSegment(point: Point, start: Point, end: Point): { point: Point; position: number; distance: number } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const position = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  const closest = pointOnSegment(start, end, position)
  return {
    point: closest,
    position,
    distance: Math.hypot(point.x - closest.x, point.y - closest.y),
  }
}

function polygonVertices(node: CanvasNode): Record<'top' | 'right' | 'bottom' | 'left', Point> | null {
  if (node.shape !== 'diamond') return null
  return {
    top: { x: node.x + node.width / 2, y: node.y },
    right: { x: node.x + node.width, y: node.y + node.height / 2 },
    bottom: { x: node.x + node.width / 2, y: node.y + node.height },
    left: { x: node.x, y: node.y + node.height / 2 },
  }
}

function polygonEdgeAnchorForPoint(node: CanvasNode, point: Point, snapThreshold: number): CanvasEdgeAnchor | null {
  const vertices = polygonVertices(node)
  if (!vertices) return null
  const segments: Array<{ side: JsonCanvasSide; start: Point; end: Point }> = [
    { side: 'top', start: vertices.top, end: vertices.right },
    { side: 'right', start: vertices.right, end: vertices.bottom },
    { side: 'bottom', start: vertices.bottom, end: vertices.left },
    { side: 'left', start: vertices.left, end: vertices.top },
  ]
  const closest = segments
    .map((segment) => ({ ...segment, ...closestPointOnSegment(point, segment.start, segment.end) }))
    .sort((a, b) => a.distance - b.distance)[0]
  if (!closest) return null
  const sideLength = Math.hypot(closest.end.x - closest.start.x, closest.end.y - closest.start.y)
  return { side: closest.side, position: snapMidpoint(closest.position, sideLength, snapThreshold) }
}

export function edgeAnchorForPoint(node: CanvasNode, point: Point, snapThreshold = 14): CanvasEdgeAnchor {
  return polygonEdgeAnchorForPoint(node, point, snapThreshold) ?? rectangularEdgeAnchorForPoint(node, point, snapThreshold)
}

export function anchorForSide(node: CanvasNode, side?: JsonCanvasSide): Point {
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y }
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 }
  if (side === 'bottom') return { x: node.x + node.width / 2, y: node.y + node.height }
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 }
  return nodeCenter(node)
}

export function autoSidePair(fromNode: CanvasNode, toNode: CanvasNode): { fromSide: JsonCanvasSide; toSide: JsonCanvasSide } {
  const from = nodeCenter(fromNode)
  const to = nodeCenter(toNode)
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' }
  }
  return dy >= 0 ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' }
}

function controlOffset(side: JsonCanvasSide | undefined, magnitude: number): Point {
  if (side === 'top') return { x: 0, y: -magnitude }
  if (side === 'right') return { x: magnitude, y: 0 }
  if (side === 'bottom') return { x: 0, y: magnitude }
  if (side === 'left') return { x: -magnitude, y: 0 }
  return { x: magnitude, y: 0 }
}

export function anchorForEdgeAnchor(node: CanvasNode, anchor?: CanvasEdgeAnchor): Point {
  if (!anchor) return anchorForSide(node)
  const position = clamp(anchor.position, 0, 1)
  const vertices = polygonVertices(node)
  if (vertices) {
    if (anchor.side === 'top') return pointOnSegment(vertices.top, vertices.right, position)
    if (anchor.side === 'right') return pointOnSegment(vertices.right, vertices.bottom, position)
    if (anchor.side === 'bottom') return pointOnSegment(vertices.bottom, vertices.left, position)
    if (anchor.side === 'left') return pointOnSegment(vertices.left, vertices.top, position)
  }
  if (anchor.side === 'top') return { x: node.x + node.width * position, y: node.y }
  if (anchor.side === 'right') return { x: node.x + node.width, y: node.y + node.height * position }
  if (anchor.side === 'bottom') return { x: node.x + node.width * position, y: node.y + node.height }
  return { x: node.x, y: node.y + node.height * position }
}

export function edgePath(edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): string {
  const sidePair = autoSidePair(fromNode, toNode)
  const fromSide = edge.fromAnchor?.side ?? edge.fromSide ?? sidePair.fromSide
  const toSide = edge.toAnchor?.side ?? edge.toSide ?? sidePair.toSide
  const start = edge.fromAnchor ? anchorForEdgeAnchor(fromNode, edge.fromAnchor) : anchorForSide(fromNode, fromSide)
  const end = edge.toAnchor ? anchorForEdgeAnchor(toNode, edge.toAnchor) : anchorForSide(toNode, toSide)
  const routing = edge.style?.routing ?? 'curved'

  if (routing === 'straight') return `M ${start.x} ${start.y} L ${end.x} ${end.y}`

  if (routing === 'elbow') {
    const outset = 32
    const startOut = controlOffset(fromSide, outset)
    const endOut = controlOffset(toSide, outset)
    const startStub = { x: start.x + startOut.x, y: start.y + startOut.y }
    const endStub = { x: end.x + endOut.x, y: end.y + endOut.y }

    if (fromSide === 'left' || fromSide === 'right') {
      const midX = (startStub.x + endStub.x) / 2
      return `M ${start.x} ${start.y} L ${startStub.x} ${startStub.y} L ${midX} ${startStub.y} L ${midX} ${endStub.y} L ${endStub.x} ${endStub.y} L ${end.x} ${end.y}`
    }
    const midY = (startStub.y + endStub.y) / 2
    return `M ${start.x} ${start.y} L ${startStub.x} ${startStub.y} L ${startStub.x} ${midY} L ${endStub.x} ${midY} L ${endStub.x} ${endStub.y} L ${end.x} ${end.y}`
  }

  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const magnitude = clamp(distance * 0.35, 48, 180)
  const fromOffset = controlOffset(fromSide, magnitude)
  const toOffset = controlOffset(toSide, magnitude)
  const c1 = { x: start.x + fromOffset.x, y: start.y + fromOffset.y }
  const c2 = { x: end.x + toOffset.x, y: end.y + toOffset.y }
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
}

function pointOnCubic(start: Point, c1: Point, c2: Point, end: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * end.y,
  }
}

function pointAtHalfPolylineLength(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0] ?? { x: 0, y: 0 }

  const segments = points.slice(1).map((point, index) => {
    const previous = points[index] ?? point
    return {
      start: previous,
      end: point,
      length: Math.hypot(point.x - previous.x, point.y - previous.y),
    }
  })
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0)
  let remaining = totalLength / 2

  for (const segment of segments) {
    if (remaining <= segment.length) {
      const t = segment.length === 0 ? 0 : remaining / segment.length
      return pointOnSegment(segment.start, segment.end, t)
    }
    remaining -= segment.length
  }

  return points[points.length - 1] ?? { x: 0, y: 0 }
}

export function edgeLabelPoint(edge: CanvasEdge, fromNode: CanvasNode, toNode: CanvasNode): Point {
  const sidePair = autoSidePair(fromNode, toNode)
  const fromSide = edge.fromAnchor?.side ?? edge.fromSide ?? sidePair.fromSide
  const toSide = edge.toAnchor?.side ?? edge.toSide ?? sidePair.toSide
  const start = edge.fromAnchor ? anchorForEdgeAnchor(fromNode, edge.fromAnchor) : anchorForSide(fromNode, fromSide)
  const end = edge.toAnchor ? anchorForEdgeAnchor(toNode, edge.toAnchor) : anchorForSide(toNode, toSide)
  const routing = edge.style?.routing ?? 'curved'

  if (routing === 'straight') return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

  if (routing === 'elbow') {
    const outset = 32
    const startOut = controlOffset(fromSide, outset)
    const endOut = controlOffset(toSide, outset)
    const startStub = { x: start.x + startOut.x, y: start.y + startOut.y }
    const endStub = { x: end.x + endOut.x, y: end.y + endOut.y }

    if (fromSide === 'left' || fromSide === 'right') {
      const midX = (startStub.x + endStub.x) / 2
      return pointAtHalfPolylineLength([start, startStub, { x: midX, y: startStub.y }, { x: midX, y: endStub.y }, endStub, end])
    }
    const midY = (startStub.y + endStub.y) / 2
    return pointAtHalfPolylineLength([start, startStub, { x: startStub.x, y: midY }, { x: endStub.x, y: midY }, endStub, end])
  }

  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const magnitude = clamp(distance * 0.35, 48, 180)
  const fromOffset = controlOffset(fromSide, magnitude)
  const toOffset = controlOffset(toSide, magnitude)
  const c1 = { x: start.x + fromOffset.x, y: start.y + fromOffset.y }
  const c2 = { x: end.x + toOffset.x, y: end.y + toOffset.y }
  return pointOnCubic(start, c1, c2, end, 0.5)
}

export function canvasBounds(nodes: readonly CanvasNode[], padding = 120): Rect {
  if (nodes.length === 0) return { x: -padding, y: -padding, width: padding * 2, height: padding * 2 }
  const minX = Math.min(...nodes.map((node) => node.x)) - padding
  const minY = Math.min(...nodes.map((node) => node.y)) - padding
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + padding
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + padding
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
