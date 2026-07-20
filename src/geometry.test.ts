import { describe, expect, it } from 'vitest'
import { anchorForEdgeAnchor, centerViewportForDocument, defaultEdgeAnchorForSide, defaultEdgeConnection, edgeAnchorForPoint, edgeLabelPoint, edgePath, edgeRoutePoints, edgeWaypointHandlePoint, moveOrthogonalRouteSegment, roundedPolylinePath, sideForPoint } from './geometry'
import { createCanvasNode } from './model'

describe('connector anchor geometry', () => {
  const node = createCanvasNode({ id: 'n', x: 100, y: 200, width: 140, height: 140 })

  it('snaps points to the nearest side of a node', () => {
    expect(sideForPoint(node, { x: 170, y: 204 })).toBe('top')
    expect(sideForPoint(node, { x: 236, y: 270 })).toBe('right')
    expect(sideForPoint(node, { x: 170, y: 336 })).toBe('bottom')
    expect(sideForPoint(node, { x: 104, y: 270 })).toBe('left')
  })

  it('keeps non-midpoint anchors instead of crowding every edge at the center', () => {
    const freeAnchor = edgeAnchorForPoint(node, { x: 120, y: 202 }, 8)
    expect(freeAnchor.side).toBe('top')
    expect(freeAnchor.position).toBeCloseTo(0.1428, 3)
    expect(edgeAnchorForPoint(node, { x: 168, y: 202 }, 8)).toEqual({ side: 'top', position: 0.5 })
  })

  it('resolves an edge anchor back to a point on the node outline', () => {
    expect(anchorForEdgeAnchor(node, { side: 'bottom', position: 0.25 })).toEqual({ x: 135, y: 340 })
  })

  it('centers a document in a viewport without changing zoom by default', () => {
    const viewport = centerViewportForDocument({ nodes: [createCanvasNode({ id: 'root', x: 14, y: 62, width: 132, height: 36 })] }, { width: 800, height: 600 })
    expect(viewport).toEqual({ x: 320, y: 220, zoom: 1 })
  })

  it('defaults diamond anchors to cardinal points', () => {
    const diamond = createCanvasNode({ id: 'd', x: 100, y: 200, width: 140, height: 140, shape: 'diamond' })
    const anchor = defaultEdgeAnchorForSide(diamond, 'right')
    expect(anchor).toEqual({ side: 'right', position: 0 })
    expect(anchorForEdgeAnchor(diamond, anchor)).toEqual({ x: 240, y: 270 })
  })

  it('chooses shared defaults for diamond branches and back edges', () => {
    const diamond = createCanvasNode({ id: 'decision', x: 200, y: 0, width: 140, height: 140, shape: 'diamond' })
    const lower = createCanvasNode({ id: 'lower', x: 420, y: 220, width: 180, height: 80 })
    const previous = createCanvasNode({ id: 'previous', x: -120, y: 220, width: 180, height: 80 })

    expect(defaultEdgeConnection(diamond, lower)).toMatchObject({
      fromSide: 'bottom',
      toSide: 'top',
      fromAnchor: { side: 'bottom', position: 0 },
    })
    expect(defaultEdgeConnection(lower, previous)).toMatchObject({
      fromSide: 'bottom',
      toSide: 'bottom',
      style: { routing: 'elbow' },
    })
  })

  it('uses editable waypoints for edge paths and handles', () => {
    const fromNode = createCanvasNode({ id: 'from', x: 0, y: 0, width: 100, height: 100 })
    const toNode = createCanvasNode({ id: 'to', x: 200, y: 0, width: 100, height: 100 })
    const edge = {
      id: 'edge',
      fromNode: 'from',
      toNode: 'to',
      fromAnchor: { side: 'right' as const, position: 0.5 },
      toAnchor: { side: 'left' as const, position: 0.5 },
      waypoints: [{ x: 150, y: 120 }],
    }

    expect(edgePath(edge, fromNode, toNode)).toBe('M 100 50 L 120 50 Q 132 50 132 62 L 132 111 Q 132 120 141 120 L 141 120 Q 150 120 150 111 L 150 62 Q 150 50 162 50 L 200 50')
    expect(edgeWaypointHandlePoint(edge, fromNode, toNode)).toEqual({ x: 150, y: 120 })
  })

  it('rounds orthogonal connector corners without changing endpoints', () => {
    expect(roundedPolylinePath([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ], 12)).toBe('M 0 0 L 28 0 Q 40 0 40 12 L 40 40')
  })

  it('moves orthogonal route segments without introducing diagonals', () => {
    const route = [
      { x: 100, y: 50 },
      { x: 132, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 150 },
      { x: 268, y: 150 },
      { x: 300, y: 150 },
    ]

    const moved = moveOrthogonalRouteSegment(route, 2, { x: 40, y: 10 })
    expect(moved).toEqual([
      { x: 100, y: 50 },
      { x: 240, y: 50 },
      { x: 240, y: 150 },
      { x: 300, y: 150 },
    ])
  })

  it('moves a whole collinear run when dragging one part of an elbow side', () => {
    const route = [
      { x: 100, y: 50 },
      { x: 132, y: 50 },
      { x: 200, y: 50 },
      { x: 200, y: 150 },
      { x: 300, y: 150 },
    ]

    expect(moveOrthogonalRouteSegment(route, 0, { x: 0, y: 40 })).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 90 },
      { x: 200, y: 90 },
      { x: 200, y: 150 },
      { x: 300, y: 150 },
    ])
  })

  it('orthogonalizes persisted waypoints so edited routes never render diagonals', () => {
    const fromNode = createCanvasNode({ id: 'from', x: 0, y: 0, width: 100, height: 100 })
    const toNode = createCanvasNode({ id: 'to', x: 300, y: 0, width: 100, height: 100 })
    const edge = {
      id: 'edge',
      fromNode: 'from',
      toNode: 'to',
      fromAnchor: { side: 'right' as const, position: 0.5 },
      toAnchor: { side: 'left' as const, position: 0.5 },
      waypoints: [{ x: 200, y: 80 }],
    }

    const route = edgeRoutePoints(edge, fromNode, toNode)
    expect(route.every((point, index) => {
      const next = route[index + 1]
      return !next || point.x === next.x || point.y === next.y
    })).toBe(true)
    expect(route.at(-2)).toMatchObject({ y: 50 })
    expect(route.at(-1)).toEqual({ x: 300, y: 50 })
  })

  it('uses a minimal route for face-to-face connectors', () => {
    const fromNode = createCanvasNode({ id: 'from', x: 0, y: 0, width: 100, height: 80 })
    const toNode = createCanvasNode({ id: 'to', x: 300, y: 160, width: 100, height: 80 })
    const edge = {
      id: 'edge',
      fromNode: 'from',
      toNode: 'to',
      fromAnchor: { side: 'right' as const, position: 0.5 },
      toAnchor: { side: 'left' as const, position: 0.5 },
      style: { routing: 'elbow' as const },
    }

    expect(edgeRoutePoints(edge, fromNode, toNode)).toEqual([
      { x: 100, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 200 },
      { x: 300, y: 200 },
    ])
  })

  it('uses one bend when perpendicular endpoints already face a shared corner', () => {
    const fromNode = createCanvasNode({ id: 'from', x: 300, y: 0, width: 100, height: 80 })
    const toNode = createCanvasNode({ id: 'to', x: 0, y: 200, width: 100, height: 80 })
    const edge = {
      id: 'edge',
      fromNode: 'from',
      toNode: 'to',
      fromAnchor: { side: 'bottom' as const, position: 0.5 },
      toAnchor: { side: 'right' as const, position: 0.5 },
      style: { routing: 'elbow' as const },
    }

    expect(edgeRoutePoints(edge, fromNode, toNode)).toEqual([
      { x: 350, y: 80 },
      { x: 350, y: 240 },
      { x: 100, y: 240 },
    ])
  })

  it('routes same-side bottom connectors outside both nodes', () => {
    const fromNode = createCanvasNode({ id: 'from', x: 300, y: 300, width: 100, height: 80 })
    const toNode = createCanvasNode({ id: 'to', x: 0, y: 100, width: 100, height: 80 })
    const edge = {
      id: 'edge',
      fromNode: 'from',
      toNode: 'to',
      fromAnchor: { side: 'bottom' as const, position: 0.5 },
      toAnchor: { side: 'bottom' as const, position: 0.5 },
      style: { routing: 'elbow' as const },
    }

    const points = edgeRoutePoints(edge, fromNode, toNode)
    expect(points).toEqual([
      { x: 350, y: 380 },
      { x: 350, y: 412 },
      { x: 50, y: 412 },
      { x: 50, y: 180 },
    ])
  })

  it('turns a dragged straight segment into an orthogonal elbow route', () => {
    const route = [
      { x: 100, y: 50 },
      { x: 300, y: 50 },
    ]

    expect(moveOrthogonalRouteSegment(route, 0, { x: 0, y: 60 })).toEqual([
      { x: 100, y: 50 },
      { x: 100, y: 110 },
      { x: 300, y: 110 },
      { x: 300, y: 50 },
    ])
  })

  it('places labels on the connector path instead of beside it', () => {
    const fromNode = createCanvasNode({ id: 'from', x: 0, y: 0, width: 100, height: 100 })
    const toNode = createCanvasNode({ id: 'to', x: 200, y: 200, width: 100, height: 100 })
    expect(edgeLabelPoint({
      id: 'edge',
      fromNode: 'from',
      toNode: 'to',
      fromAnchor: { side: 'right', position: 0.5 },
      toAnchor: { side: 'top', position: 0.5 },
      style: { routing: 'elbow' },
    }, fromNode, toNode)).toEqual({ x: 250, y: 50 })
  })
})
