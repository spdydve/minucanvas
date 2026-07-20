import { describe, expect, it } from 'vitest'
import { createCanvasEdge, createCanvasNode, deleteSelection, duplicateSelection, frameSelection, resetEdgeRoute, shapeForTool, snapPoint, updateEdge } from './model'
import type { JsonCanvasDocument } from './types'

describe('canvas model helpers', () => {
  it('creates JSON Canvas compatible nodes and edges', () => {
    const start = createCanvasNode({ id: 'start', x: 0, y: 0, text: 'Start' })
    const end = createCanvasNode({ id: 'end', x: 240, y: 0, text: 'End', shape: 'diamond' })
    const edge = createCanvasEdge('start', 'end', { id: 'edge-1' })

    expect(start.type).toBe('text')
    expect(end.shape).toBe('diamond')
    expect(edge.toEnd).toBe('arrow')
  })

  it('updates one edge without disturbing host metadata or other edges', () => {
    type EdgeExtra = { host: { relationshipId: string } }
    const edge = createCanvasEdge<EdgeExtra>('a', 'b', { id: 'edge-1', host: { relationshipId: 'relationship-1' } })
    const other = createCanvasEdge<EdgeExtra>('b', 'c', { id: 'edge-2', host: { relationshipId: 'relationship-2' } })
    const document: JsonCanvasDocument<Record<string, unknown>, EdgeExtra> = { nodes: [], edges: [edge, other] }

    const updated = updateEdge(document, edge.id, (current) => ({ ...current, label: 'Updated' }))

    expect(updated.edges[0]).toMatchObject({ label: 'Updated', host: { relationshipId: 'relationship-1' } })
    expect(updated.edges[1]).toBe(other)
  })

  it('resets manual connector geometry to an automatic route', () => {
    const from = createCanvasNode({ id: 'from', x: 0, y: 0, width: 100, height: 80 })
    const to = createCanvasNode({ id: 'to', x: 300, y: 0, width: 100, height: 80 })
    const edge = createCanvasEdge('from', 'to', {
      id: 'edge-1',
      fromAnchor: { side: 'top', position: 0.25 },
      toAnchor: { side: 'bottom', position: 0.75 },
      routingMode: 'manual',
      waypoints: [{ x: 50, y: -80 }, { x: 350, y: -80 }],
    })

    const reset = resetEdgeRoute({ nodes: [from, to], edges: [edge] }, edge.id).edges[0]

    expect(reset).toMatchObject({
      routingMode: 'auto',
      fromSide: 'right',
      toSide: 'left',
      fromAnchor: { side: 'right', position: 0.5 },
      toAnchor: { side: 'left', position: 0.5 },
    })
    expect(reset?.waypoints).toBeUndefined()
  })

  it('preserves typed host metadata when creating nodes and edges', () => {
    type NodeExtra = { host: { recordId: string; status?: string } }
    type EdgeExtra = { host: { relationshipId: string } }

    const node = createCanvasNode<NodeExtra>({
      id: 'record',
      text: 'Record',
      host: { recordId: 'record-1', status: 'active' },
    })
    const edge = createCanvasEdge<EdgeExtra>('record', 'other', {
      id: 'relationship',
      host: { relationshipId: 'relationship-1' },
    })

    expect(node.host).toEqual({ recordId: 'record-1', status: 'active' })
    expect(edge.host).toEqual({ relationshipId: 'relationship-1' })
  })

  it('deletes selected nodes and attached edges', () => {
    const document: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'a' }), createCanvasNode({ id: 'b' })],
      edges: [createCanvasEdge('a', 'b', { id: 'ab' })],
    }

    expect(deleteSelection(document, { nodeIds: ['a'], edgeIds: [] })).toEqual({
      nodes: [document.nodes[1]],
      edges: [],
    })
  })

  it('creates frame groups around selected nodes', () => {
    const document: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'a', x: 0, y: 0 }), createCanvasNode({ id: 'b', x: 260, y: 0 })],
      edges: [],
    }

    const result = frameSelection(document, { nodeIds: ['a', 'b'], edgeIds: [] })

    expect(result.group).toMatchObject({ type: 'group', frame: true, label: 'Frame' })
    expect(result.document.nodes.find((node) => node.id === 'a')?.groupId).toBe(result.group?.id)
    expect(result.document.nodes.find((node) => node.id === 'b')?.groupId).toBe(result.group?.id)
  })

  it('duplicates selected subgraphs', () => {
    const document: JsonCanvasDocument = {
      nodes: [createCanvasNode({ id: 'a' }), createCanvasNode({ id: 'b' })],
      edges: [createCanvasEdge('a', 'b', { id: 'ab' })],
    }

    const duplicated = duplicateSelection(document, { nodeIds: ['a', 'b'], edgeIds: [] })

    expect(duplicated.document.nodes).toHaveLength(4)
    expect(duplicated.document.edges).toHaveLength(2)
    expect(duplicated.selection.nodeIds).toHaveLength(2)
    expect(duplicated.selection.edgeIds).toHaveLength(1)
  })

  it('creates free-standing and hybrid line edges with points', () => {
    const edge = createCanvasEdge('', '', {
      id: 'free-arrow',
      fromPoint: { x: 10, y: 20 },
      toPoint: { x: 110, y: 80 },
      toEnd: 'arrow',
      style: { routing: 'straight' },
    })

    expect(edge.fromPoint).toEqual({ x: 10, y: 20 })
    expect(edge.toPoint).toEqual({ x: 110, y: 80 })
    expect(edge.toEnd).toBe('arrow')

    const hybrid = createCanvasEdge('node-a', '', {
      id: 'hybrid-line',
      toPoint: { x: 220, y: 40 },
      toEnd: 'none',
    })
    expect(hybrid.fromNode).toBe('node-a')
    expect(hybrid.toNode).toBe('')
    expect(hybrid.toPoint).toEqual({ x: 220, y: 40 })
  })

  it('creates default flow nodes with a compact height', () => {
    const node = createCanvasNode({ type: 'text', shape: 'rounded-rectangle' })
    expect(node.width).toBe(220)
    expect(node.height).toBe(88)
  })

  it('creates default diamonds at a 3:2 grid-friendly ratio', () => {
    const node = createCanvasNode({ type: 'text', shape: 'diamond' })
    expect(node.width).toBe(240)
    expect(node.height).toBe(160)
  })

  it('creates default ellipses as true circles', () => {
    const node = createCanvasNode({ type: 'text', shape: 'ellipse' })
    expect(node.width).toBe(160)
    expect(node.height).toBe(160)
  })

  it('maps tool keys to matching base flowchart shapes', () => {
    expect(shapeForTool('rectangle')).toBe('rectangle')
    expect(shapeForTool('diamond')).toBe('diamond')
    expect(shapeForTool('ellipse')).toBe('ellipse')
  })

  it('snaps points to the configured grid', () => {
    expect(snapPoint({ x: 23, y: 38 }, 20)).toEqual({ x: 20, y: 40 })
  })
})
