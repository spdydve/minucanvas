import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { anchorForEdgeAnchor, autoSidePair, canvasBounds, clientToCanvas, edgeAnchorForPoint, edgeLabelPoint, edgePath, sideFacingPoint, sideForPoint, type Point } from './geometry'
import {
  createCanvasEdge,
  createCanvasNode,
  deleteSelection as deleteSelectionFromDocument,
  duplicateSelection,
  nodeLabel,
  normalizeSelection,
  shapeForTool,
  snapPoint,
  updateNode,
} from './model'
import { isEditableTarget, toolFromKey } from './shortcuts'
import type {
  CanvasChangeContext,
  CanvasEdge,
  CanvasEdgeAnchor,
  CanvasHandle,
  CanvasNode,
  CanvasSelection,
  CanvasTool,
  CanvasViewport,
  JsonCanvasDocument,
  JsonCanvasSide,
  MinuCanvasProps,
} from './types'
import './theme/theme.css'

interface ConnectorAnchor extends CanvasEdgeAnchor {
  nodeId: string
  toEnd: 'none' | 'arrow'
}

type DragState<NodeExtra extends Record<string, unknown>> =
  | {
      kind: 'pan'
      startClient: Point
      startViewport: CanvasViewport
    }
  | {
      kind: 'nodes'
      startPoint: Point
      nodeIds: string[]
      originals: Map<string, CanvasNode<NodeExtra>>
    }
  | {
      kind: 'connector'
      fromNodeId: string
      fromAnchor: CanvasEdgeAnchor
      toEnd: 'none' | 'arrow'
      pointer: Point
    }
  | {
      kind: 'edge-anchor'
      edgeId: string
      endpoint: 'from' | 'to'
    }
  | {
      kind: 'resize-node'
      nodeId: string
      handle: ResizeHandle
      startPoint: Point
      original: CanvasNode<NodeExtra>
    }
  | null

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.12
const CONNECTOR_MIDPOINT_SNAP_PX = 14
const CONNECTOR_EDGE_HIT_PX = 18
const MIN_NODE_SIZE = 48
const SHAPE_TOOLS = new Set<CanvasTool>(['text', 'rectangle', 'diamond', 'ellipse', 'pill'])
type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
type AddDirection = JsonCanvasSide

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

function nodeStyle(node: CanvasNode): CSSProperties {
  const style = node.style ?? {}
  return {
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    '--mc-node-fill': style.fill ?? node.background,
    '--mc-node-stroke': style.stroke ?? node.color,
    '--mc-node-text': style.text,
    '--mc-node-stroke-width': style.strokeWidth ? `${style.strokeWidth}px` : undefined,
    '--mc-node-radius': style.borderRadius ? `${style.borderRadius}px` : undefined,
    '--mc-node-opacity': style.opacity,
    '--mc-node-font-size': style.fontSize ? `${style.fontSize}px` : undefined,
    '--mc-node-font-weight': style.fontWeight,
  } as CSSProperties
}

function nodeShapeClass(node: CanvasNode): string {
  return `minucanvas-node--${node.shape ?? 'rounded-rectangle'}`
}

function polygonShapePath(shape: CanvasNode['shape']): string | null {
  if (shape === 'diamond') return 'M 50 1 L 99 50 L 50 99 L 1 50 Z'
  if (shape === 'parallelogram') return 'M 18 1 L 99 1 L 82 99 L 1 99 Z'
  if (shape === 'hexagon') return 'M 20 1 L 80 1 L 99 50 L 80 99 L 20 99 L 1 50 Z'
  return null
}

function edgeDash(edge: CanvasEdge): string | undefined {
  const strokeStyle = edge.style?.strokeStyle
  if (strokeStyle === 'dashed' || strokeStyle === 'sketch') return '10 8'
  if (strokeStyle === 'dotted') return '2 8'
  return undefined
}

function edgeMarkerEnd(edge: CanvasEdge): string | undefined {
  return (edge.toEnd ?? 'arrow') === 'arrow' ? 'url(#minucanvas-arrow)' : undefined
}

function formatToolLabel(tool: CanvasTool): string {
  return tool.slice(0, 1).toUpperCase() + tool.slice(1)
}

function isConnectorTool(tool: CanvasTool): boolean {
  return tool === 'arrow' || tool === 'line'
}

function connectorEndForTool(tool: CanvasTool): 'none' | 'arrow' {
  return tool === 'arrow' ? 'arrow' : 'none'
}

function isNodeTool(tool: CanvasTool): boolean {
  return SHAPE_TOOLS.has(tool)
}

function selectionEquals(a: CanvasSelection, b: CanvasSelection): boolean {
  return a.nodeIds.join('\u0000') === b.nodeIds.join('\u0000') && a.edgeIds.join('\u0000') === b.edgeIds.join('\u0000')
}

function oppositeSide(side: JsonCanvasSide): JsonCanvasSide {
  if (side === 'top') return 'bottom'
  if (side === 'right') return 'left'
  if (side === 'bottom') return 'top'
  return 'right'
}

function rectsOverlap(a: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>, b: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function resizeNodeRect(node: CanvasNode, handle: ResizeHandle, dx: number, dy: number, snapToGrid: boolean, gridSize: number): Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'> {
  let x = node.x
  let y = node.y
  let width = node.width
  let height = node.height

  if (handle.includes('e')) width = node.width + dx
  if (handle.includes('s')) height = node.height + dy
  if (handle.includes('w')) {
    x = node.x + dx
    width = node.width - dx
  }
  if (handle.includes('n')) {
    y = node.y + dy
    height = node.height - dy
  }

  if (width < MIN_NODE_SIZE) {
    if (handle.includes('w')) x -= MIN_NODE_SIZE - width
    width = MIN_NODE_SIZE
  }
  if (height < MIN_NODE_SIZE) {
    if (handle.includes('n')) y -= MIN_NODE_SIZE - height
    height = MIN_NODE_SIZE
  }

  if (!snapToGrid) return { x, y, width, height }

  const topLeft = snapPoint({ x, y }, gridSize)
  const bottomRight = snapPoint({ x: x + width, y: y + height }, gridSize)
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(MIN_NODE_SIZE, bottomRight.x - topLeft.x),
    height: Math.max(MIN_NODE_SIZE, bottomRight.y - topLeft.y),
  }
}

function recenterMovedNodeEdges<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  movedNodeIds: readonly string[],
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const moved = new Set(movedNodeIds)
  if (moved.size === 0) return document

  const nodes = new Map(document.nodes.map((node) => [node.id, node]))
  return {
    ...document,
    edges: document.edges.map((edge) => {
      if (!moved.has(edge.fromNode) && !moved.has(edge.toNode)) return edge

      const fromNode = nodes.get(edge.fromNode)
      const toNode = nodes.get(edge.toNode)
      if (!fromNode || !toNode) return edge

      // Re-evaluate both endpoints after a connected shape moves/resizes.
      // Preserving the old side can leave connectors visually crossing through
      // shapes after layout changes. Recomputing both sides makes the line face
      // the opposite node and anchors it at the center of that side.
      const fromSide = sideFacingPoint(fromNode, {
        x: toNode.x + toNode.width / 2,
        y: toNode.y + toNode.height / 2,
      })
      const toSide = sideFacingPoint(toNode, {
        x: fromNode.x + fromNode.width / 2,
        y: fromNode.y + fromNode.height / 2,
      })

      return {
        ...edge,
        fromSide,
        fromAnchor: { side: fromSide, position: 0.5 },
        toSide,
        toAnchor: { side: toSide, position: 0.5 },
      }
    }),
  }
}

function DefaultNodeContent({ node, editing }: { node: CanvasNode; editing: boolean }) {
  const label = nodeLabel(node)
  if (node.type === 'file') {
    return <span className="minucanvas-node__muted">📄 {label}</span>
  }
  if (node.type === 'link') {
    return <span className="minucanvas-node__muted">↗ {label}</span>
  }
  if (node.type === 'group') {
    return <span className="minucanvas-node__group-label">{node.label ?? label}</span>
  }
  return <span>{editing ? label : label}</span>
}

function MinuCanvasInner<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>>(
  {
    value,
    onChange,
    readOnly = false,
    className,
    autoFocus = false,
    minHeight = 520,
    maxHeight,
    canvasTheme,
    theme = 'system',
    shapeTheme = 'outline',
    tool,
    defaultTool = 'select',
    selectedNodeIds,
    selectedEdgeIds,
    initialViewport,
    autoFit = false,
    onSelectionChange,
    onToolChange,
    onViewportChange,
    renderNode,
    renderEdgeLabel,
    getNodeDefaults,
    grid = true,
    snapToGrid = true,
    gridSize = 20,
    shortcuts = true,
  }: MinuCanvasProps<NodeExtra, EdgeExtra>,
  ref: ForwardedRef<CanvasHandle<NodeExtra, EdgeExtra>>,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState<NodeExtra>>(null)
  const addSequenceRef = useRef<{ sourceNodeId: string; direction: AddDirection; lastNodeId: string } | null>(null)
  const autoFitDoneRef = useRef(false)
  const [, forcePointerFrame] = useState(0)
  const [viewport, setViewportState] = useState<CanvasViewport>(initialViewport ?? { x: 0, y: 0, zoom: 1 })
  const [localTool, setLocalTool] = useState<CanvasTool>(defaultTool)
  const [localSelection, setLocalSelection] = useState<CanvasSelection>({ nodeIds: [], edgeIds: [] })
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [pendingConnectorAnchor, setPendingConnectorAnchor] = useState<ConnectorAnchor | null>(null)
  const activeTool = tool ?? localTool
  const selection = normalizeSelection({
    nodeIds: selectedNodeIds ?? localSelection.nodeIds,
    edgeIds: selectedEdgeIds ?? localSelection.edgeIds,
  })
  const nodeById = useMemo(() => new Map(value.nodes.map((node) => [node.id, node])), [value.nodes])

  const setViewport = useCallback(
    (next: CanvasViewport) => {
      const normalized = { ...next, zoom: clampZoom(next.zoom) }
      setViewportState(normalized)
      onViewportChange?.(normalized)
    },
    [onViewportChange],
  )

  const emitSelection = useCallback(
    (nextSelection: CanvasSelection) => {
      const normalized = normalizeSelection(nextSelection)
      if (selectedNodeIds === undefined && selectedEdgeIds === undefined) setLocalSelection(normalized)
      if (!selectionEquals(selection, normalized)) onSelectionChange?.(normalized)
    },
    [onSelectionChange, selectedEdgeIds, selectedNodeIds, selection],
  )

  const setActiveTool = useCallback(
    (nextTool: CanvasTool) => {
      if (tool === undefined) setLocalTool(nextTool)
      onToolChange?.(nextTool)
    },
    [onToolChange, tool],
  )

  const emitChange = useCallback(
    (nextValue: JsonCanvasDocument<NodeExtra, EdgeExtra>, reason: CanvasChangeContext['reason']) => {
      onChange(nextValue, { reason })
    },
    [onChange],
  )

  const createNodeAt = useCallback(
    (canvasPoint: Point, sourceTool: CanvasTool): CanvasNode<NodeExtra> => {
      const shape = shapeForTool(sourceTool)
      const defaults: Partial<CanvasNode<NodeExtra>> = getNodeDefaults?.(sourceTool, canvasPoint) ?? {}
      const width = defaults.width ?? (sourceTool === 'text' ? 220 : sourceTool === 'diamond' ? 140 : 180)
      const height = defaults.height ?? (sourceTool === 'diamond' ? 140 : 100)
      const point = snapToGrid ? snapPoint(canvasPoint, gridSize) : canvasPoint
      const partial = {
        ...defaults,
        type: defaults.type ?? 'text',
        shape,
        x: point.x - width / 2,
        y: point.y - height / 2,
        width,
        height,
        text: defaults.text,
      } as Partial<CanvasNode<NodeExtra>>
      const node = createCanvasNode<NodeExtra>(partial)
      emitChange({ ...value, nodes: [...value.nodes, node] }, 'create-node')
      emitSelection({ nodeIds: [node.id], edgeIds: [] })
      setActiveTool('select')
      return node
    },
    [emitChange, emitSelection, getNodeDefaults, gridSize, setActiveTool, snapToGrid, value],
  )

  const deleteCurrentSelection = useCallback(() => {
    if (readOnly) return
    if (selection.nodeIds.length === 0 && selection.edgeIds.length === 0) return
    emitChange(deleteSelectionFromDocument(value, selection), 'delete')
    emitSelection({ nodeIds: [], edgeIds: [] })
  }, [emitChange, emitSelection, readOnly, selection, value])

  const duplicateCurrentSelection = useCallback(() => {
    if (readOnly || selection.nodeIds.length === 0) return
    const result = duplicateSelection(value, selection)
    emitChange(result.document, 'duplicate')
    emitSelection(result.selection)
  }, [emitChange, emitSelection, readOnly, selection, value])

  const createEdgeBetween = useCallback(
    (fromNodeId: string, toNodeId: string, partial: Partial<CanvasEdge<EdgeExtra>> = {}) => {
      if (readOnly || fromNodeId === toNodeId) return null
      const fromNode = nodeById.get(fromNodeId)
      const toNode = nodeById.get(toNodeId)
      if (!fromNode || !toNode) return null
      const edge = createCanvasEdge<EdgeExtra>(fromNodeId, toNodeId, {
        ...partial,
        fromSide: partial.fromAnchor?.side ?? partial.fromSide ?? autoSidePair(fromNode, toNode).fromSide,
        toSide: partial.toAnchor?.side ?? partial.toSide ?? autoSidePair(fromNode, toNode).toSide,
      })
      emitChange({ ...value, edges: [...value.edges, edge] }, 'create-edge')
      emitSelection({ nodeIds: [], edgeIds: [edge.id] })
      return edge
    },
    [emitChange, emitSelection, nodeById, readOnly, value],
  )

  const selectionPoint = useCallback((): Point | null => {
    const selectedNode = selection.nodeIds.length === 1 ? nodeById.get(selection.nodeIds[0] ?? '') : null
    if (selectedNode) return { x: selectedNode.x + selectedNode.width / 2, y: selectedNode.y + selectedNode.height / 2 }

    const selectedEdge = selection.edgeIds.length === 1 ? value.edges.find((edge) => edge.id === selection.edgeIds[0]) : null
    if (selectedEdge) {
      const fromNode = nodeById.get(selectedEdge.fromNode)
      const toNode = nodeById.get(selectedEdge.toNode)
      if (fromNode && toNode) return edgeLabelPoint(selectedEdge, fromNode, toNode)
    }

    return null
  }, [nodeById, selection.edgeIds, selection.nodeIds, value.edges])

  const navigateSelection = useCallback(
    (direction: AddDirection) => {
      const origin = selectionPoint()
      if (!origin) return false

      const candidates: Array<{ kind: 'node' | 'edge'; id: string; point: Point }> = [
        ...value.nodes
          .filter((node) => !selection.nodeIds.includes(node.id))
          .map((node) => ({
            kind: 'node' as const,
            id: node.id,
            point: { x: node.x + node.width / 2, y: node.y + node.height / 2 },
          })),
        ...value.edges.flatMap((edge) => {
          if (selection.edgeIds.includes(edge.id)) return []
          const fromNode = nodeById.get(edge.fromNode)
          const toNode = nodeById.get(edge.toNode)
          if (!fromNode || !toNode) return []
          return [{ kind: 'edge' as const, id: edge.id, point: edgeLabelPoint(edge, fromNode, toNode) }]
        }),
      ]

      const ranked = candidates
        .map((candidate) => {
          const dx = candidate.point.x - origin.x
          const dy = candidate.point.y - origin.y
          const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'top' ? -dy : dy
          const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
          return { ...candidate, primary, secondary, score: primary + secondary * 0.75 }
        })
        .filter((candidate) => candidate.primary > 8 && candidate.primary >= candidate.secondary)
        .sort((a, b) => a.score - b.score)

      const next = ranked[0]
      if (!next) return false
      if (next.kind === 'node') emitSelection({ nodeIds: [next.id], edgeIds: [] })
      else emitSelection({ nodeIds: [], edgeIds: [next.id] })
      return true
    },
    [emitSelection, nodeById, selection.edgeIds, selection.nodeIds, selectionPoint, value.edges, value.nodes],
  )

  const cycleSelection = useCallback(
    (backward: boolean) => {
      const items = [
        ...value.nodes.map((node) => ({ kind: 'node' as const, id: node.id })),
        ...value.edges.map((edge) => ({ kind: 'edge' as const, id: edge.id })),
      ]
      if (items.length === 0) return false
      const currentIndex = items.findIndex((item) => (
        item.kind === 'node'
          ? selection.nodeIds.includes(item.id)
          : selection.edgeIds.includes(item.id)
      ))
      const nextIndex = currentIndex === -1
        ? 0
        : (currentIndex + (backward ? -1 : 1) + items.length) % items.length
      const next = items[nextIndex]
      if (!next) return false
      if (next.kind === 'node') emitSelection({ nodeIds: [next.id], edgeIds: [] })
      else emitSelection({ nodeIds: [], edgeIds: [next.id] })
      return true
    },
    [emitSelection, selection.edgeIds, selection.nodeIds, value.edges, value.nodes],
  )

  const createConnectedNode = useCallback(
    (sourceNode: CanvasNode<NodeExtra>, direction: AddDirection) => {
      if (readOnly) return
      const gap = 140
      const width = sourceNode.width
      const height = sourceNode.height
      const siblingCount = value.edges.filter(
        (edge) => edge.fromNode === sourceNode.id && (edge.fromAnchor?.side ?? edge.fromSide) === direction,
      ).length
      const laneMagnitude = Math.ceil(siblingCount / 2)
      const laneSign = siblingCount === 0 ? 0 : siblingCount % 2 === 1 ? -1 : 1
      const laneOffset = laneSign * laneMagnitude * ((direction === 'left' || direction === 'right' ? height : width) + 44)
      let rect: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'> = {
        x: direction === 'right'
          ? sourceNode.x + sourceNode.width + gap
          : direction === 'left'
            ? sourceNode.x - width - gap
            : sourceNode.x + sourceNode.width / 2 - width / 2 + laneOffset,
        y: direction === 'bottom'
          ? sourceNode.y + sourceNode.height + gap
          : direction === 'top'
            ? sourceNode.y - height - gap
            : sourceNode.y + sourceNode.height / 2 - height / 2 + laneOffset,
        width,
        height,
      }

      if (snapToGrid) {
        const snapped = snapPoint({ x: rect.x, y: rect.y }, gridSize)
        rect = { ...rect, x: snapped.x, y: snapped.y }
      }

      const nudgeDistance = direction === 'left' || direction === 'right' ? height + 44 : width + 44
      let attempts = 0
      while (attempts < 12 && value.nodes.some((node) => rectsOverlap(rect, node))) {
        if (direction === 'left' || direction === 'right') {
          rect = { ...rect, y: rect.y + (laneSign < 0 ? -nudgeDistance : nudgeDistance) }
        } else {
          rect = { ...rect, x: rect.x + (laneSign < 0 ? -nudgeDistance : nudgeDistance) }
        }
        attempts += 1
      }

      const node = createCanvasNode<NodeExtra>({
        type: sourceNode.type,
        shape: sourceNode.shape,
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
        text: undefined,
      } as Partial<CanvasNode<NodeExtra>>)
      const edge = createCanvasEdge<EdgeExtra>(sourceNode.id, node.id, {
        fromAnchor: { side: direction, position: 0.5 },
        toAnchor: { side: oppositeSide(direction), position: 0.5 },
        toEnd: 'arrow',
      } as Partial<CanvasEdge<EdgeExtra>>)

      emitChange({ nodes: [...value.nodes, node], edges: [...value.edges, edge] }, 'create-node')
      emitSelection({ nodeIds: [node.id], edgeIds: [] })
      addSequenceRef.current = { sourceNodeId: sourceNode.id, direction, lastNodeId: node.id }
      setActiveTool('select')
      setEditingNodeId(node.id)
    },
    [emitChange, emitSelection, gridSize, readOnly, setActiveTool, snapToGrid, value.edges, value.nodes],
  )

  const connectorAnchorAtPoint = useCallback(
    (point: Point, excludeNodeId?: string): { node: CanvasNode<NodeExtra>; anchor: CanvasEdgeAnchor; point: Point } | null => {
      const hitThreshold = CONNECTOR_EDGE_HIT_PX / viewport.zoom
      const snapThreshold = CONNECTOR_MIDPOINT_SNAP_PX / viewport.zoom
      let closest: { node: CanvasNode<NodeExtra>; anchor: CanvasEdgeAnchor; point: Point; distance: number } | null = null

      for (let index = value.nodes.length - 1; index >= 0; index -= 1) {
        const node = value.nodes[index]
        if (!node || node.id === excludeNodeId) continue
        const anchor = edgeAnchorForPoint(node, point, snapThreshold)
        const anchorPoint = anchorForEdgeAnchor(node, anchor)
        const distance = Math.hypot(point.x - anchorPoint.x, point.y - anchorPoint.y)
        if (distance > hitThreshold) continue
        if (!closest || distance < closest.distance) {
          closest = { node, anchor, point: anchorPoint, distance }
        }
      }

      return closest ? { node: closest.node, anchor: closest.anchor, point: closest.point } : null
    },
    [value.nodes, viewport.zoom],
  )

  const updateEdgeAnchor = useCallback(
    (edgeId: string, endpoint: 'from' | 'to', node: CanvasNode<NodeExtra>, anchor: CanvasEdgeAnchor) => {
      if (readOnly) return
      const nextEdges = value.edges.map((edge) => {
        if (edge.id !== edgeId) return edge
        if (endpoint === 'from') {
          if (edge.toNode === node.id) return edge
          return {
            ...edge,
            fromNode: node.id,
            fromSide: anchor.side,
            fromAnchor: anchor,
          }
        }
        if (edge.fromNode === node.id) return edge
        return {
          ...edge,
          toNode: node.id,
          toSide: anchor.side,
          toAnchor: anchor,
        }
      })
      emitChange({ ...value, edges: nextEdges }, 'update-edge')
    },
    [emitChange, readOnly, value],
  )

  const updateEdgeLabel = useCallback(
    (edgeId: string, label: string) => {
      const normalized = label.trim()
      const nextEdges = value.edges.map((edge) => {
        if (edge.id !== edgeId) return edge
        const nextEdge = { ...edge }
        if (normalized) nextEdge.label = normalized
        else delete nextEdge.label
        return nextEdge
      })
      emitChange({ ...value, edges: nextEdges }, 'update-edge')
    },
    [emitChange, value],
  )

  const zoomBy = useCallback((delta: number) => {
    setViewport({ ...viewport, zoom: viewport.zoom + delta })
  }, [setViewport, viewport])

  const resetView = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 })
  }, [setViewport])

  const fitView = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const bounds = canvasBounds(value.nodes, 100)
    const zoom = clampZoom(Math.min(root.clientWidth / bounds.width, root.clientHeight / bounds.height, 1.2))
    setViewport({
      zoom,
      x: root.clientWidth / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: root.clientHeight / 2 - (bounds.y + bounds.height / 2) * zoom,
    })
  }, [setViewport, value.nodes])

  useImperativeHandle(ref, () => ({
    getDocument: () => value,
    getSelection: () => selection,
    selectAll: () => emitSelection({ nodeIds: value.nodes.map((node) => node.id), edgeIds: value.edges.map((edge) => edge.id) }),
    clearSelection: () => emitSelection({ nodeIds: [], edgeIds: [] }),
    deleteSelection: deleteCurrentSelection,
    setTool: setActiveTool,
    createNode: (partial) => {
      const node = createCanvasNode<NodeExtra>(partial)
      emitChange({ ...value, nodes: [...value.nodes, node] }, 'create-node')
      emitSelection({ nodeIds: [node.id], edgeIds: [] })
      return node
    },
    createEdge: createEdgeBetween,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    resetView,
    fitView,
  }), [createEdgeBetween, deleteCurrentSelection, emitChange, emitSelection, fitView, resetView, selection, setActiveTool, value, zoomBy])

  useEffect(() => {
    if (autoFocus) rootRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!isConnectorTool(activeTool)) setPendingConnectorAnchor(null)
  }, [activeTool])

  useEffect(() => {
    if (!autoFit || autoFitDoneRef.current) return
    autoFitDoneRef.current = true
    requestAnimationFrame(fitView)
  }, [autoFit, fitView])

  const pointFromEvent = useCallback((event: PointerEvent<Element>): Point => {
    const root = rootRef.current
    if (!root) return { x: 0, y: 0 }
    return clientToCanvas({ x: event.clientX, y: event.clientY }, root.getBoundingClientRect(), viewport)
  }, [viewport])

  const handleNodePointerDown = useCallback((event: PointerEvent<HTMLDivElement>, node: CanvasNode<NodeExtra>) => {
    if (readOnly) return
    event.stopPropagation()
    rootRef.current?.focus()
    if (isConnectorTool(activeTool)) {
      const point = pointFromEvent(event)
      const hit = connectorAnchorAtPoint(point)
      if (!hit || hit.node.id !== node.id) return
      const toEnd = connectorEndForTool(activeTool)

      if (pendingConnectorAnchor && pendingConnectorAnchor.nodeId !== node.id) {
        createEdgeBetween(pendingConnectorAnchor.nodeId, node.id, {
          fromAnchor: { side: pendingConnectorAnchor.side, position: pendingConnectorAnchor.position },
          toAnchor: hit.anchor,
          toEnd: pendingConnectorAnchor.toEnd,
        } as Partial<CanvasEdge<EdgeExtra>>)
        setPendingConnectorAnchor(null)
        return
      }

      setPendingConnectorAnchor({ nodeId: node.id, ...hit.anchor, toEnd })
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { kind: 'connector', fromNodeId: node.id, fromAnchor: hit.anchor, toEnd, pointer: hit.point }
      emitSelection({ nodeIds: [node.id], edgeIds: [] })
      return
    }

    if (activeTool !== 'select') return
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const nextNodeIds = additive
      ? selection.nodeIds.includes(node.id)
        ? selection.nodeIds.filter((id) => id !== node.id)
        : [...selection.nodeIds, node.id]
      : selection.nodeIds.includes(node.id)
        ? selection.nodeIds
        : [node.id]
    const nextSelection = { nodeIds: nextNodeIds, edgeIds: [] }
    emitSelection(nextSelection)

    const originals = new Map<string, CanvasNode<NodeExtra>>()
    for (const id of nextSelection.nodeIds) {
      const selectedNode = nodeById.get(id)
      if (selectedNode) originals.set(id, selectedNode)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind: 'nodes',
      startPoint: pointFromEvent(event),
      nodeIds: nextSelection.nodeIds,
      originals,
    }
  }, [activeTool, connectorAnchorAtPoint, createEdgeBetween, emitSelection, nodeById, pendingConnectorAnchor, pointFromEvent, readOnly, selection.nodeIds])

  const handleSurfacePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    rootRef.current?.focus()
    setEditingEdgeId(null)
    if (event.button === 1 || activeTool === 'hand' || event.altKey) {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = {
        kind: 'pan',
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: viewport,
      }
      return
    }

    if (!readOnly && isNodeTool(activeTool)) {
      createNodeAt(pointFromEvent(event), activeTool)
      return
    }

    if (isConnectorTool(activeTool)) {
      const point = pointFromEvent(event)
      const hit = connectorAnchorAtPoint(point)
      if (hit) {
        if (pendingConnectorAnchor && pendingConnectorAnchor.nodeId !== hit.node.id) {
          createEdgeBetween(pendingConnectorAnchor.nodeId, hit.node.id, {
            fromAnchor: { side: pendingConnectorAnchor.side, position: pendingConnectorAnchor.position },
            toAnchor: hit.anchor,
            toEnd: pendingConnectorAnchor.toEnd,
          } as Partial<CanvasEdge<EdgeExtra>>)
          setPendingConnectorAnchor(null)
          return
        }

        const toEnd = connectorEndForTool(activeTool)
        setPendingConnectorAnchor({ nodeId: hit.node.id, ...hit.anchor, toEnd })
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { kind: 'connector', fromNodeId: hit.node.id, fromAnchor: hit.anchor, toEnd, pointer: hit.point }
        emitSelection({ nodeIds: [hit.node.id], edgeIds: [] })
        return
      }

      setPendingConnectorAnchor(null)
    }

    emitSelection({ nodeIds: [], edgeIds: [] })
  }, [activeTool, connectorAnchorAtPoint, createEdgeBetween, createNodeAt, emitSelection, pendingConnectorAnchor, pointFromEvent, readOnly, viewport])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.kind === 'pan') {
      setViewport({
        ...drag.startViewport,
        x: drag.startViewport.x + event.clientX - drag.startClient.x,
        y: drag.startViewport.y + event.clientY - drag.startClient.y,
      })
      return
    }

    const point = pointFromEvent(event)
    if (drag.kind === 'connector') {
      const hit = connectorAnchorAtPoint(point, drag.fromNodeId)
      const pointer = hit ? hit.point : point
      dragRef.current = { ...drag, pointer }
      forcePointerFrame((frame) => frame + 1)
      return
    }

    if (drag.kind === 'edge-anchor') {
      const hit = connectorAnchorAtPoint(point)
      if (hit) {
        updateEdgeAnchor(drag.edgeId, drag.endpoint, hit.node, hit.anchor)
      }
      return
    }

    if (drag.kind === 'resize-node') {
      const dx = point.x - drag.startPoint.x
      const dy = point.y - drag.startPoint.y
      const rect = resizeNodeRect(drag.original, drag.handle, dx, dy, snapToGrid, gridSize)
      emitChange(
        recenterMovedNodeEdges(
          updateNode(value, drag.nodeId, (node) => ({ ...node, ...rect })),
          [drag.nodeId],
        ),
        'update-node',
      )
      return
    }

    const dx = point.x - drag.startPoint.x
    const dy = point.y - drag.startPoint.y
    const moved = drag.nodeIds.reduce<JsonCanvasDocument<NodeExtra, EdgeExtra>>((document, nodeId) => {
      const original = drag.originals.get(nodeId)
      if (!original) return document
      const nextPosition = snapToGrid
        ? snapPoint({ x: original.x + dx, y: original.y + dy }, gridSize)
        : { x: original.x + dx, y: original.y + dy }
      return updateNode(document, nodeId, (node) => ({ ...node, x: nextPosition.x, y: nextPosition.y }))
    }, value)
    emitChange(recenterMovedNodeEdges(moved, drag.nodeIds), 'move-node')
  }, [connectorAnchorAtPoint, emitChange, gridSize, pointFromEvent, setViewport, snapToGrid, updateEdgeAnchor, value])

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    forcePointerFrame((frame) => frame + 1)
    if (!drag) return
    if (drag.kind === 'edge-anchor') return
    if (drag.kind !== 'connector') return
    const targetPoint = pointFromEvent(event)
    const hit = connectorAnchorAtPoint(targetPoint, drag.fromNodeId)
    if (hit) {
      const edgePartial = {
        fromAnchor: drag.fromAnchor,
        toAnchor: hit.anchor,
        toEnd: drag.toEnd,
      } as Partial<CanvasEdge<EdgeExtra>>
      createEdgeBetween(drag.fromNodeId, hit.node.id, edgePartial)
      setPendingConnectorAnchor(null)
      return
    }
    setPendingConnectorAnchor({ nodeId: drag.fromNodeId, ...drag.fromAnchor, toEnd: drag.toEnd })
  }, [connectorAnchorAtPoint, createEdgeBetween, pointFromEvent])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const before = clientToCanvas({ x: event.clientX, y: event.clientY }, rect, viewport)
    const nextZoom = clampZoom(viewport.zoom * (event.deltaY < 0 ? 1.08 : 0.92))
    setViewport({
      zoom: nextZoom,
      x: event.clientX - rect.left - before.x * nextZoom,
      y: event.clientY - rect.top - before.y * nextZoom,
    })
  }, [setViewport, viewport])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!shortcuts || isEditableTarget(event.target)) return
    const mod = event.metaKey || event.ctrlKey
    if (event.key === 'Escape') {
      setEditingNodeId(null)
      setEditingEdgeId(null)
      setPendingConnectorAnchor(null)
      emitSelection({ nodeIds: [], edgeIds: [] })
      setActiveTool('select')
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      cycleSelection(event.shiftKey)
      return
    }
    if ((event.key === 'Enter' || event.key === 'F2') && !readOnly) {
      if (selection.nodeIds.length === 1) {
        event.preventDefault()
        setEditingNodeId(selection.nodeIds[0] ?? null)
        return
      }
      if (selection.edgeIds.length === 1) {
        event.preventDefault()
        setEditingEdgeId(selection.edgeIds[0] ?? null)
        return
      }
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && !readOnly) {
      event.preventDefault()
      deleteCurrentSelection()
      return
    }
    if (!mod && !event.altKey && !event.shiftKey) {
      const direction = event.key === 'ArrowUp'
        ? 'top'
        : event.key === 'ArrowRight'
          ? 'right'
          : event.key === 'ArrowDown'
            ? 'bottom'
            : event.key === 'ArrowLeft'
              ? 'left'
              : null
      if (direction && navigateSelection(direction)) {
        event.preventDefault()
        return
      }
    }
    if (mod && !readOnly && selection.nodeIds.length === 1) {
      const selectedNodeId = selection.nodeIds[0] ?? ''
      const direction = event.key === 'ArrowUp'
        ? 'top'
        : event.key === 'ArrowRight'
          ? 'right'
          : event.key === 'ArrowDown'
            ? 'bottom'
            : event.key === 'ArrowLeft'
              ? 'left'
              : null
      if (direction) {
        const sequence = addSequenceRef.current
        const sourceNodeId = sequence?.direction === direction && sequence.lastNodeId === selectedNodeId
          ? sequence.sourceNodeId
          : selectedNodeId
        const sourceNode = nodeById.get(sourceNodeId)
        if (sourceNode) {
          event.preventDefault()
          createConnectedNode(sourceNode, direction)
          return
        }
      }
    }
    if (mod && event.key.toLowerCase() === 'd' && !readOnly) {
      event.preventDefault()
      duplicateCurrentSelection()
      return
    }
    if (mod && (event.key === '+' || event.key === '=')) {
      event.preventDefault()
      zoomBy(ZOOM_STEP)
      return
    }
    if (mod && event.key === '-') {
      event.preventDefault()
      zoomBy(-ZOOM_STEP)
      return
    }
    if (mod && event.key === '0') {
      event.preventDefault()
      resetView()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    const nextTool = toolFromKey(event.key)
    if (nextTool) {
      event.preventDefault()
      setActiveTool(nextTool)
    }
  }, [createConnectedNode, cycleSelection, deleteCurrentSelection, duplicateCurrentSelection, emitSelection, navigateSelection, nodeById, readOnly, resetView, selection.edgeIds, selection.nodeIds, setActiveTool, shortcuts, zoomBy])

  const handleNodeTextBlur = useCallback((node: CanvasNode<NodeExtra>, text: string) => {
    setEditingNodeId(null)
    if (readOnly || text === nodeLabel(node)) return
    emitChange(
      updateNode(value, node.id, (current) => {
        const next = { ...current }
        if (current.type === 'text') next.text = text
        if (current.type === 'group') next.label = text
        return next
      }),
      'update-node',
    )
  }, [emitChange, readOnly, value])

  const connectorPreview = dragRef.current?.kind === 'connector' ? dragRef.current : null
  const worldStyle: CSSProperties = {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  }
  const rootStyle: CSSProperties = {
    minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
    maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
    '--mc-grid-size': `${gridSize}px`,
  } as CSSProperties
  const activeCanvasTheme = canvasTheme ?? theme
  const themeClass = activeCanvasTheme === 'system' ? '' : ` minucanvas--theme-${activeCanvasTheme}`
  const shapeThemeClass = ` minucanvas--shape-${shapeTheme}`

  return (
    <div
      ref={rootRef}
      className={`minucanvas${grid ? ' minucanvas--grid' : ''}${readOnly ? ' minucanvas--readonly' : ''}${themeClass}${shapeThemeClass}${className ? ` ${className}` : ''}`}
      data-tool={activeTool}
      data-minucanvas
      onKeyDown={handleKeyDown}
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      role="application"
      aria-label="Canvas editor"
      tabIndex={0}
      style={rootStyle}
    >
      <div className="minucanvas-world" style={worldStyle}>
        <svg className="minucanvas-edges" aria-hidden="true">
          <defs>
            <marker id="minucanvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          {value.edges.map((edge) => {
            const fromNode = nodeById.get(edge.fromNode)
            const toNode = nodeById.get(edge.toNode)
            if (!fromNode || !toNode) return null
            const selected = selection.edgeIds.includes(edge.id)
            const path = edgePath(edge, fromNode, toNode)
            const strokeStyle = edge.style?.strokeStyle
            return (
              <g key={edge.id} className={`minucanvas-edge${selected ? ' minucanvas-edge--selected' : ''}${strokeStyle === 'sketch' ? ' minucanvas-edge--sketch' : ''}`}>
                {strokeStyle === 'sketch' ? <path className="minucanvas-edge__sketch-shadow" d={path} /> : null}
                <path
                  className="minucanvas-edge__hit-area"
                  d={path}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    if (!readOnly) {
                      emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                      setEditingEdgeId(edge.id)
                    }
                  }}
                />
                <path
                  className="minucanvas-edge__path"
                  d={path}
                  stroke={edge.style?.stroke ?? edge.color}
                  strokeWidth={edge.style?.strokeWidth}
                  strokeDasharray={edgeDash(edge)}
                  opacity={edge.style?.opacity}
                  markerEnd={edgeMarkerEnd(edge)}
                  pointerEvents="none"
                />
              </g>
            )
          })}
          {connectorPreview ? (() => {
            const fromNode = nodeById.get(connectorPreview.fromNodeId)
            if (!fromNode) return null
            const start = anchorForEdgeAnchor(fromNode, connectorPreview.fromAnchor)
            return <path className="minucanvas-edge__preview" d={`M ${start.x} ${start.y} L ${connectorPreview.pointer.x} ${connectorPreview.pointer.y}`} />
          })() : null}
          {value.edges.map((edge) => {
            if (!selection.edgeIds.includes(edge.id)) return null
            const fromNode = nodeById.get(edge.fromNode)
            const toNode = nodeById.get(edge.toNode)
            if (!fromNode || !toNode) return null
            const fromAnchor = edge.fromAnchor ?? {
              side: edge.fromSide ?? sideForPoint(fromNode, { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 }),
              position: 0.5,
            }
            const toAnchor = edge.toAnchor ?? {
              side: edge.toSide ?? sideForPoint(toNode, { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 }),
              position: 0.5,
            }
            const fromPoint = anchorForEdgeAnchor(fromNode, fromAnchor)
            const toPoint = anchorForEdgeAnchor(toNode, toAnchor)
            return (
              <g key={`${edge.id}-handles`} className="minucanvas-edge-handles">
                <circle
                  className="minucanvas-edge-handle minucanvas-edge-handle--from"
                  cx={fromPoint.x}
                  cy={fromPoint.y}
                  r={7}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                    dragRef.current = { kind: 'edge-anchor', edgeId: edge.id, endpoint: 'from' }
                  }}
                />
                <circle
                  className="minucanvas-edge-handle minucanvas-edge-handle--to"
                  cx={toPoint.x}
                  cy={toPoint.y}
                  r={7}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                    dragRef.current = { kind: 'edge-anchor', edgeId: edge.id, endpoint: 'to' }
                  }}
                />
              </g>
            )
          })}
        </svg>

        {value.edges.map((edge) => {
          const fromNode = nodeById.get(edge.fromNode)
          const toNode = nodeById.get(edge.toNode)
          const editingEdge = editingEdgeId === edge.id
          if (!fromNode || !toNode || (!edge.label && !editingEdge)) return null
          const point = edgeLabelPoint(edge, fromNode, toNode)
          return (
            <div
              key={`${edge.id}-label`}
              className={`minucanvas-edge-label${editingEdge ? ' minucanvas-edge-label--editing' : ''}`}
              style={{ left: point.x, top: point.y }}
              contentEditable={editingEdge && !readOnly}
              suppressContentEditableWarning
              ref={(element) => {
                if (!element || !editingEdge || readOnly) return
                requestAnimationFrame(() => {
                  element.focus()
                  const range = document.createRange()
                  range.selectNodeContents(element)
                  const selectedRange = window.getSelection()
                  selectedRange?.removeAllRanges()
                  selectedRange?.addRange(range)
                })
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
                emitSelection({ nodeIds: [], edgeIds: [edge.id] })
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (!readOnly) setEditingEdgeId(edge.id)
              }}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditingEdgeId(null)
                }
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
              onBlur={(event) => {
                if (!editingEdge) return
                updateEdgeLabel(edge.id, event.currentTarget.textContent ?? '')
                setEditingEdgeId(null)
              }}
            >
              {editingEdge ? edge.label ?? '' : renderEdgeLabel?.({ edge, selected: selection.edgeIds.includes(edge.id) }) ?? edge.label}
            </div>
          )
        })}

        {value.nodes.map((node) => {
          const selected = selection.nodeIds.includes(node.id)
          const editing = editingNodeId === node.id
          const pendingConnector = pendingConnectorAnchor?.nodeId === node.id
          const polygonPath = polygonShapePath(node.shape)
          return (
            <div
              key={node.id}
              className={`minucanvas-node minucanvas-node--type-${node.type} ${nodeShapeClass(node)}${selected ? ' minucanvas-node--selected' : ''}${editing ? ' minucanvas-node--editing' : ''}${pendingConnector ? ' minucanvas-node--connector-source' : ''}`}
              data-minucanvas-node-id={node.id}
              style={nodeStyle(node)}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (!readOnly) setEditingNodeId(node.id)
              }}
            >
              {polygonPath ? (
                <svg className="minucanvas-node__shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d={polygonPath} />
                </svg>
              ) : null}
              <div
                className="minucanvas-node__content"
                contentEditable={editing && !readOnly}
                suppressContentEditableWarning
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setEditingNodeId(null)
                  }
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
                onBlur={(event) => handleNodeTextBlur(node, event.currentTarget.textContent ?? '')}
              >
                {renderNode?.({ node, selected, editing }) ?? <DefaultNodeContent node={node} editing={editing} />}
              </div>
            </div>
          )
        })}

        <svg className="minucanvas-overlays" aria-hidden="true">
          {value.nodes.map((node) => {
            if (!selection.nodeIds.includes(node.id) || readOnly) return null
            const addHandles: Array<{ direction: AddDirection; x: number; y: number; label: string; hintX: number; hintAnchor: 'start' | 'end' }> = [
              { direction: 'top', x: node.x + node.width / 2, y: node.y - 28, label: '⌘↑', hintX: 16, hintAnchor: 'start' },
              { direction: 'right', x: node.x + node.width + 28, y: node.y + node.height / 2, label: '⌘→', hintX: 16, hintAnchor: 'start' },
              { direction: 'bottom', x: node.x + node.width / 2, y: node.y + node.height + 28, label: '⌘↓', hintX: 16, hintAnchor: 'start' },
              { direction: 'left', x: node.x - 28, y: node.y + node.height / 2, label: '⌘←', hintX: -16, hintAnchor: 'end' },
            ]
            const handles: Array<{ id: ResizeHandle; x: number; y: number }> = [
              { id: 'nw', x: node.x, y: node.y },
              { id: 'n', x: node.x + node.width / 2, y: node.y },
              { id: 'ne', x: node.x + node.width, y: node.y },
              { id: 'e', x: node.x + node.width, y: node.y + node.height / 2 },
              { id: 'se', x: node.x + node.width, y: node.y + node.height },
              { id: 's', x: node.x + node.width / 2, y: node.y + node.height },
              { id: 'sw', x: node.x, y: node.y + node.height },
              { id: 'w', x: node.x, y: node.y + node.height / 2 },
            ]
            return (
              <g key={`${node.id}-shape-handles`}>
                <g className="minucanvas-add-handles">
                  {addHandles.map((handle) => (
                    <g
                      key={handle.direction}
                      className={`minucanvas-add-handle minucanvas-add-handle--${handle.direction}`}
                      transform={`translate(${handle.x} ${handle.y})`}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        createConnectedNode(node, handle.direction)
                      }}
                    >
                      <circle r={11} />
                      <text className="minucanvas-add-handle__plus" textAnchor="middle" dominantBaseline="central">+</text>
                      <text className="minucanvas-add-handle__hint" x={handle.hintX} y={4} textAnchor={handle.hintAnchor}>{handle.label}</text>
                    </g>
                  ))}
                </g>
                <g className="minucanvas-resize-handles">
                {handles.map((handle) => (
                  <rect
                    key={handle.id}
                    className={`minucanvas-resize-handle minucanvas-resize-handle--${handle.id}`}
                    x={handle.x - 5}
                    y={handle.y - 5}
                    width={10}
                    height={10}
                    rx={2}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      emitSelection({ nodeIds: [node.id], edgeIds: [] })
                      dragRef.current = {
                        kind: 'resize-node',
                        nodeId: node.id,
                        handle: handle.id,
                        startPoint: pointFromEvent(event),
                        original: node,
                      }
                    }}
                  />
                ))}
                </g>
              </g>
            )
          })}
          {value.edges.map((edge) => {
            if (!selection.edgeIds.includes(edge.id)) return null
            const fromNode = nodeById.get(edge.fromNode)
            const toNode = nodeById.get(edge.toNode)
            if (!fromNode || !toNode) return null
            const fromAnchor = edge.fromAnchor ?? {
              side: edge.fromSide ?? sideForPoint(fromNode, { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 }),
              position: 0.5,
            }
            const toAnchor = edge.toAnchor ?? {
              side: edge.toSide ?? sideForPoint(toNode, { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 }),
              position: 0.5,
            }
            const fromPoint = anchorForEdgeAnchor(fromNode, fromAnchor)
            const toPoint = anchorForEdgeAnchor(toNode, toAnchor)
            return (
              <g key={`${edge.id}-overlay-handles`} className="minucanvas-edge-handles">
                <circle
                  className="minucanvas-edge-handle minucanvas-edge-handle--from"
                  cx={fromPoint.x}
                  cy={fromPoint.y}
                  r={8}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                    dragRef.current = { kind: 'edge-anchor', edgeId: edge.id, endpoint: 'from' }
                  }}
                />
                <circle
                  className="minucanvas-edge-handle minucanvas-edge-handle--to"
                  cx={toPoint.x}
                  cy={toPoint.y}
                  r={8}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                    dragRef.current = { kind: 'edge-anchor', edgeId: edge.id, endpoint: 'to' }
                  }}
                />
              </g>
            )
          })}
        </svg>
      </div>
      <div className="minucanvas-status" aria-live="polite">
        <span>{formatToolLabel(activeTool)}</span>
        <span>{Math.round(viewport.zoom * 100)}%</span>
      </div>
    </div>
  )
}

export const MinuCanvas = forwardRef(MinuCanvasInner) as <
  NodeExtra extends Record<string, unknown> = Record<string, unknown>,
  EdgeExtra extends Record<string, unknown> = Record<string, unknown>,
>(
  props: MinuCanvasProps<NodeExtra, EdgeExtra> & { ref?: ForwardedRef<CanvasHandle<NodeExtra, EdgeExtra>> },
) => ReactElement | null
