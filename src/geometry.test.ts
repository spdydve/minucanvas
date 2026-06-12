import { describe, expect, it } from 'vitest'
import { anchorForEdgeAnchor, edgeAnchorForPoint, edgeLabelPoint, sideForPoint } from './geometry'
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
    }, fromNode, toNode)).toEqual({ x: 191, y: 109 })
  })
})
