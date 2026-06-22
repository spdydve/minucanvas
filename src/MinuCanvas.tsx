import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { anchorForEdgeAnchor, canvasBounds, clientToCanvas, defaultEdgeAnchorForSide, defaultEdgeConnection, edgeAnchorForPoint, edgeLabelPoint, edgePath, edgeRoutePoints, moveOrthogonalRouteSegment, sideForPoint, type Point } from './geometry'
import { layoutMindMap } from './mindmap'
import {
  alignSelection as alignSelectionInDocument,
  bringSelectionForward,
  bringSelectionToFront,
  cloneCanvas,
  createCanvasEdge,
  createCanvasNode,
  createId,
  deleteSelection as deleteSelectionFromDocument,
  distributeSelection as distributeSelectionInDocument,
  duplicateSelection,
  groupSelection as groupSelectionInDocument,
  nodeLabel,
  normalizeSelection,
  sendSelectionBackward,
  sendSelectionToBack,
  shapeForTool,
  snapPoint,
  ungroupSelection as ungroupSelectionInDocument,
  updateNode,
} from './model'
import { isEditableTarget, toolFromKey } from './shortcuts'
import type {
  CanvasAlignment,
  CanvasChangeContext,
  CanvasDistribution,
  CanvasEdge,
  CanvasEdgeAnchor,
  CanvasHandle,
  CanvasNode,
  CanvasSelection,
  CanvasShape,
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

type AlignmentGuide =
  | { axis: 'x'; value: number; from: number; to: number }
  | { axis: 'y'; value: number; from: number; to: number }

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
      kind: 'edge-segment'
      edgeId: string
      segmentIndex: number
      startPoint: Point
      originalPoints: Point[]
    }
  | {
      kind: 'resize-node'
      nodeId: string
      handle: ResizeHandle
      startPoint: Point
      original: CanvasNode<NodeExtra>
      childOriginals: Map<string, CanvasNode<NodeExtra>>
    }
  | {
      kind: 'selection-box'
      startPoint: Point
      pointer: Point
      additive: boolean
      originalSelection: CanvasSelection
    }
  | null

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.12
const CONNECTOR_MIDPOINT_SNAP_PX = 14
const CONNECTOR_EDGE_HIT_PX = 18
const MIN_NODE_SIZE = 48
const DEFAULT_DIAMOND_WIDTH = 240
const DEFAULT_DIAMOND_HEIGHT = 160
const DEFAULT_ELLIPSE_SIZE = 160
const TEXT_NOTE_MIN_WIDTH = 80
const TEXT_NOTE_MAX_WIDTH = 420
const TEXT_NOTE_HORIZONTAL_PADDING = 18
const TEXT_NOTE_VERTICAL_PADDING = 14
const SHAPE_TOOLS = new Set<CanvasTool>(['text', 'rectangle', 'diamond', 'ellipse', 'pill'])
type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
type AddDirection = JsonCanvasSide

type CanvasClipboardPayload<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>> = {
  nodes: Array<CanvasNode<NodeExtra>>
  edges: Array<CanvasEdge<EdgeExtra>>
}

type ExportArea = 'canvas' | 'selection'
type ExportFileType = 'svg' | 'png'
type ExportBackground = 'transparent' | 'solid'
type ExportColorMode = 'light' | 'dark'

type ExportOptions = {
  area: ExportArea
  fileType: ExportFileType
  quality: number
  background: ExportBackground
  colorMode: ExportColorMode
}

type ShapeSwitcherState = { x: number; y: number } | null

const SHAPE_SWITCHER_SHAPES: CanvasShape[] = ['rectangle', 'pill', 'ellipse', 'diamond', 'text']

function shapeLabel(shape: CanvasShape): string {
  if (shape === 'rounded-rectangle') return 'Rounded rectangle'
  return shape.slice(0, 1).toUpperCase() + shape.slice(1).replace(/-/g, ' ')
}

function CanvasShapeIcon({ shape }: { shape: CanvasShape }) {
  if (shape === 'text') return <path d="M6 8V5h16v3M14 5v18M10 23h8" />
  if (shape === 'ellipse') return <ellipse cx="14" cy="14" rx="7.5" ry="7.5" />
  if (shape === 'diamond') return <path d="M14 5l9 9-9 9-9-9 9-9z" />
  if (shape === 'pill') return <rect x="6" y="9" width="16" height="10" rx="5" />
  return <rect x="6" y="8" width="16" height="12" rx="4" />
}

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
    '--mc-node-stroke-style': style.strokeStyle === 'dashed' || style.strokeStyle === 'sketch' ? 'dashed' : style.strokeStyle === 'dotted' ? 'dotted' : undefined,
    '--mc-node-stroke-dasharray': style.strokeStyle === 'dashed' || style.strokeStyle === 'sketch' ? '10 8' : style.strokeStyle === 'dotted' ? '2 8' : undefined,
    '--mc-node-radius': style.borderRadius ? `${style.borderRadius}px` : undefined,
    '--mc-node-opacity': style.opacity,
    '--mc-node-font-family': style.fontFamily,
    '--mc-node-font-size': style.fontSize ? `${style.fontSize}px` : undefined,
    '--mc-node-font-weight': style.fontWeight,
    '--mc-node-text-align': style.textAlign,
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

function isUrlText(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isImageUrl(value: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value.trim())
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)
}

function filesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const files = Array.from(dataTransfer.files)
  if (files.length > 0) return files
  return Array.from(dataTransfer.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
}

function linkLabelFromUrl(value: string): string {
  try {
    const url = new URL(value)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function linkNodeSize(label: string): { width: number; height: number } {
  return {
    width: Math.max(72, Math.min(320, Math.ceil(label.length * 8.5 + 34))),
    height: 36,
  }
}

function textNoteSize(text: string, fontSize = 14): { width: number; height: number } {
  const lines = text.split('\n')
  const longest = Math.max(1, ...lines.map((line) => line.length))
  return {
    width: Math.max(TEXT_NOTE_MIN_WIDTH, Math.min(TEXT_NOTE_MAX_WIDTH, Math.ceil(longest * fontSize * 0.62 + TEXT_NOTE_HORIZONTAL_PADDING))),
    height: Math.max(36, Math.ceil(lines.length * fontSize * 1.35 + TEXT_NOTE_VERTICAL_PADDING)),
  }
}

function editableText(element: HTMLElement): string {
  return element.innerText.replace(/\n$/, '')
}

function insertEditableLineBreak(element: HTMLElement) {
  const doc = element.ownerDocument
  const selection = doc.defaultView?.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  range.deleteContents()
  range.insertNode(doc.createTextNode('\n'))
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
    image.onerror = reject
    image.src = src
  })
}

function fitImageSize(width: number, height: number, maxWidth = 900, maxHeight = 600): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 640, height: 360 }
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapTextForSvg(text: string, maxWidth: number, fontSize: number): string[] {
  const explicitLines = text.split('\n')
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.58)))
  return explicitLines.flatMap((line) => {
    const words = line.split(/\s+/).filter(Boolean)
    if (words.length === 0) return ['']
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (next.length > maxChars && current) {
        lines.push(current)
        current = word
      } else {
        current = next
      }
    }
    if (current) lines.push(current)
    return lines
  })
}

function svgText(
  text: string,
  x: number,
  y: number,
  options: { color: string; fontSize: number; fontWeight: CSSProperties['fontWeight']; textAnchor: 'start' | 'middle' | 'end'; maxWidth?: number },
): string {
  const lines = options.maxWidth ? wrapTextForSvg(text, options.maxWidth, options.fontSize) : text.split('\n')
  const lineHeight = options.fontSize * 1.25
  const startY = y - ((lines.length - 1) * lineHeight) / 2
  const tspans = lines.map((line, index) => `<tspan x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`).join('')
  return `<text fill="${options.color}" font-family="ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${options.fontSize}" font-weight="${options.fontWeight}" text-anchor="${options.textAnchor}" dominant-baseline="middle">${tspans}</text>`
}

function svgShapeForNode(node: CanvasNode, defaultColor: string): string {
  const style = node.style ?? {}
  const fill = style.fill ?? node.background ?? 'transparent'
  const stroke = style.stroke ?? node.color ?? defaultColor
  const strokeWidth = style.strokeWidth ?? 1.5
  const dash = style.strokeStyle === 'dashed' || style.strokeStyle === 'sketch' ? ' stroke-dasharray="10 8"' : style.strokeStyle === 'dotted' ? ' stroke-dasharray="2 8"' : ''
  if (node.type === 'image') return `<image href="${escapeXml(node.file ?? node.url ?? '')}" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" preserveAspectRatio="xMidYMid meet" />`
  if (node.shape === 'text') return ''
  if (node.shape === 'ellipse') return `<ellipse cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`
  if (node.shape === 'diamond') return `<polygon points="${node.x + node.width / 2},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width / 2},${node.y + node.height} ${node.x},${node.y + node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`
  if (node.shape === 'parallelogram') return `<polygon points="${node.x + node.width * 0.18},${node.y} ${node.x + node.width},${node.y} ${node.x + node.width * 0.82},${node.y + node.height} ${node.x},${node.y + node.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`
  if (node.shape === 'hexagon') return `<polygon points="${node.x + node.width * 0.2},${node.y} ${node.x + node.width * 0.8},${node.y} ${node.x + node.width},${node.y + node.height / 2} ${node.x + node.width * 0.8},${node.y + node.height} ${node.x + node.width * 0.2},${node.y + node.height} ${node.x},${node.y + node.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`
  const radius = node.shape === 'pill' ? Math.min(node.width, node.height) / 2 : style.borderRadius ?? 16
  return `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash} />`
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

function directionFromArrowKey(key: string): AddDirection | null {
  if (key === 'ArrowUp') return 'top'
  if (key === 'ArrowRight') return 'right'
  if (key === 'ArrowDown') return 'bottom'
  if (key === 'ArrowLeft') return 'left'
  return null
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

function rectFromPoints(a: Point, b: Point): Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'> {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) }
}

function rectFromLine(a: Point, b: Point, padding = 8): Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'> {
  const x = Math.min(a.x, b.x) - padding
  const y = Math.min(a.y, b.y) - padding
  return { x, y, width: Math.abs(a.x - b.x) + padding * 2, height: Math.abs(a.y - b.y) + padding * 2 }
}

function boundsForNodes(nodes: Array<Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>>): Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'> | null {
  if (nodes.length === 0) return null
  const x = Math.min(...nodes.map((node) => node.x))
  const y = Math.min(...nodes.map((node) => node.y))
  const right = Math.max(...nodes.map((node) => node.x + node.width))
  const bottom = Math.max(...nodes.map((node) => node.y + node.height))
  return { x, y, width: right - x, height: bottom - y }
}

function snapMovingBoundsToGuides(
  movingBounds: Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>,
  stationaryNodes: Array<Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>>,
  threshold: number,
): { dx: number; dy: number; guides: AlignmentGuide[] } {
  let bestX: { delta: number; guide: AlignmentGuide } | null = null
  let bestY: { delta: number; guide: AlignmentGuide } | null = null
  const movingX = [movingBounds.x, movingBounds.x + movingBounds.width / 2, movingBounds.x + movingBounds.width]
  const movingY = [movingBounds.y, movingBounds.y + movingBounds.height / 2, movingBounds.y + movingBounds.height]

  for (const node of stationaryNodes) {
    const nodeX = [node.x, node.x + node.width / 2, node.x + node.width]
    const nodeY = [node.y, node.y + node.height / 2, node.y + node.height]
    for (const source of movingX) {
      for (const target of nodeX) {
        const delta = target - source
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, guide: { axis: 'x', value: target, from: Math.min(movingBounds.y, node.y), to: Math.max(movingBounds.y + movingBounds.height, node.y + node.height) } }
        }
      }
    }
    for (const source of movingY) {
      for (const target of nodeY) {
        const delta = target - source
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, guide: { axis: 'y', value: target, from: Math.min(movingBounds.x, node.x), to: Math.max(movingBounds.x + movingBounds.width, node.x + node.width) } }
        }
      }
    }
  }

  return {
    dx: bestX?.delta ?? 0,
    dy: bestY?.delta ?? 0,
    guides: [bestX?.guide, bestY?.guide].filter((guide): guide is AlignmentGuide => Boolean(guide)),
  }
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

function fitGroupsToChildren<NodeExtra extends Record<string, unknown>, EdgeExtra extends Record<string, unknown>>(
  document: JsonCanvasDocument<NodeExtra, EdgeExtra>,
  groupIds: Iterable<string>,
): JsonCanvasDocument<NodeExtra, EdgeExtra> {
  const ids = new Set(groupIds)
  if (ids.size === 0) return document
  const padding = 32
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      if (!ids.has(node.id) || node.type !== 'group') return node
      const children = document.nodes.filter((child) => child.groupId === node.id)
      if (children.length === 0) return node
      const minX = Math.min(...children.map((child) => child.x))
      const minY = Math.min(...children.map((child) => child.y))
      const maxX = Math.max(...children.map((child) => child.x + child.width))
      const maxY = Math.max(...children.map((child) => child.y + child.height))
      return {
        ...node,
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      }
    }),
  }
}

function isMindMapBranchEdge(edge: CanvasEdge): boolean {
  return edge.fromEnd === 'none' && edge.toEnd === 'none' && edge.style?.routing === 'curved'
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

      // Mind map branch edges intentionally preserve their left/right side.
      // Re-running generic defaults would treat left branches as back-edges
      // and move them to bottom-to-bottom anchors after the root is dragged.
      if (isMindMapBranchEdge(edge) && edge.fromAnchor && edge.toAnchor) {
        return {
          ...edge,
          fromSide: edge.fromAnchor.side,
          toSide: edge.toAnchor.side,
          fromAnchor: defaultEdgeAnchorForSide(fromNode, edge.fromAnchor.side),
          toAnchor: defaultEdgeAnchorForSide(toNode, edge.toAnchor.side),
        }
      }

      // Re-evaluate both endpoints after a connected shape moves/resizes.
      // Preserving the old side can leave connectors visually crossing through
      // shapes after layout changes. Shared defaults also keep diamond anchors
      // on cardinal points and route back edges consistently.
      const defaults = defaultEdgeConnection(fromNode, toNode)
      const style = { ...(defaults.style ?? {}), ...(edge.style ?? {}) }

      return {
        ...edge,
        fromSide: defaults.fromSide,
        fromAnchor: defaults.fromAnchor,
        toSide: defaults.toSide,
        toAnchor: defaults.toAnchor,
        ...(Object.keys(style).length > 0 ? { style } : {}),
      }
    }),
  }
}

function DefaultNodeContent({ node, editing }: { node: CanvasNode; editing: boolean }) {
  const label = nodeLabel(node)
  if (editing) return <>{label}</>
  if (node.type === 'file') {
    return <span className="minucanvas-node__muted">📄 {label}</span>
  }
  if (node.type === 'link') {
    const url = node.url ?? label
    return <span className="minucanvas-node__link"><span className="minucanvas-node__link-icon">↗</span><span>{node.label ?? linkLabelFromUrl(url)}</span></span>
  }
  if (node.type === 'group') {
    return <span className="minucanvas-node__group-label">{node.label ?? label}</span>
  }
  if (node.type === 'image') {
    const src = node.file ?? node.url ?? ''
    return (
      <>
        {src ? <img className="minucanvas-node__image" src={src} alt={node.label ?? label} draggable={false} onError={(event) => event.currentTarget.closest('.minucanvas-node__content')?.classList.add('minucanvas-node__content--image-error')} /> : <span className="minucanvas-node__muted">Image</span>}
        {node.imageStatus ? <span className={`minucanvas-node__image-status minucanvas-node__image-status--${node.imageStatus}`}>{node.imageStatus === 'uploading' ? 'Uploading…' : 'Image failed'}</span> : null}
      </>
    )
  }
  return <span>{label}</span>
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
    onUpload,
    onResolveLink,
    allowInlineImages = false,
    onExternalContentWarning,
    grid = true,
    snapToGrid = true,
    gridSize = 20,
    shortcuts = true,
    interactionMode = 'canvas',
  }: MinuCanvasProps<NodeExtra, EdgeExtra>,
  ref: ForwardedRef<CanvasHandle<NodeExtra, EdgeExtra>>,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const imageReplaceInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<DragState<NodeExtra>>(null)
  const addSequenceRef = useRef<{ sourceNodeId: string; direction: AddDirection; lastNodeId: string } | null>(null)
  const clipboardRef = useRef<CanvasClipboardPayload<NodeExtra, EdgeExtra> | null>(null)
  const undoStackRef = useRef<Array<JsonCanvasDocument<NodeExtra, EdgeExtra>>>([])
  const redoStackRef = useRef<Array<JsonCanvasDocument<NodeExtra, EdgeExtra>>>([])
  const undoTransactionRef = useRef<JsonCanvasDocument<NodeExtra, EdgeExtra> | null>(null)
  const undoTransactionPushedRef = useRef(false)
  const autoFitDoneRef = useRef(false)
  const valueRef = useRef(value)
  const [, forcePointerFrame] = useState(0)
  const [viewport, setViewportState] = useState<CanvasViewport>(initialViewport ?? { x: 0, y: 0, zoom: 1 })
  const [localTool, setLocalTool] = useState<CanvasTool>(defaultTool)
  const [localSelection, setLocalSelection] = useState<CanvasSelection>({ nodeIds: [], edgeIds: [] })
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)
  const [pendingConnectorAnchor, setPendingConnectorAnchor] = useState<ConnectorAnchor | null>(null)
  const [panningModifierActive, setPanningModifierActive] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [shapeSwitcher, setShapeSwitcher] = useState<ShapeSwitcherState>(null)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportOptions, setExportOptions] = useState<ExportOptions>({ area: 'canvas', fileType: 'png', quality: 2, background: 'solid', colorMode: 'dark' })
  const activeTool = tool ?? localTool
  const selection = normalizeSelection({
    nodeIds: selectedNodeIds ?? localSelection.nodeIds,
    edgeIds: selectedEdgeIds ?? localSelection.edgeIds,
  })
  const nodeById = useMemo(() => new Map(value.nodes.map((node) => [node.id, node])), [value.nodes])

  useEffect(() => {
    valueRef.current = value
  }, [value])

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
      if (!selectionEquals(selection, normalized)) {
        setShapeSwitcher(null)
        onSelectionChange?.(normalized)
      }
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
      const transactionSnapshot = undoTransactionRef.current
      if (transactionSnapshot) {
        if (!undoTransactionPushedRef.current) {
          undoStackRef.current = [...undoStackRef.current.slice(-99), cloneCanvas(transactionSnapshot)]
          redoStackRef.current = []
          undoTransactionPushedRef.current = true
        }
      } else {
        undoStackRef.current = [...undoStackRef.current.slice(-99), cloneCanvas(value)]
        redoStackRef.current = []
      }
      onChange(nextValue, { reason })
    },
    [onChange, value],
  )

  const createNodeAt = useCallback(
    (canvasPoint: Point, sourceTool: CanvasTool): CanvasNode<NodeExtra> => {
      const shape = shapeForTool(sourceTool)
      const defaults: Partial<CanvasNode<NodeExtra>> = getNodeDefaults?.(sourceTool, canvasPoint) ?? {}
      const width = defaults.width ?? (sourceTool === 'text' ? 180 : sourceTool === 'diamond' ? DEFAULT_DIAMOND_WIDTH : sourceTool === 'ellipse' ? DEFAULT_ELLIPSE_SIZE : 180)
      const height = defaults.height ?? (sourceTool === 'text' ? 48 : sourceTool === 'diamond' ? DEFAULT_DIAMOND_HEIGHT : sourceTool === 'ellipse' ? DEFAULT_ELLIPSE_SIZE : 100)
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

  const setSelectionLocked = useCallback((locked: boolean) => {
    if (readOnly || selection.nodeIds.length === 0) return
    emitChange({
      ...value,
      nodes: value.nodes.map((node) => selection.nodeIds.includes(node.id) ? { ...node, locked } : node),
    }, 'update-node')
  }, [emitChange, readOnly, selection.nodeIds, value])

  const selectedImageNode = useMemo(() => selection.nodeIds.map((id) => nodeById.get(id)).find((node) => node?.type === 'image') ?? null, [nodeById, selection.nodeIds])
  const selectedLinkNode = useMemo(() => selection.nodeIds.map((id) => nodeById.get(id)).find((node) => node?.type === 'link') ?? null, [nodeById, selection.nodeIds])

  const resizeSelectedImages = useCallback((scale: number) => {
    if (readOnly || selection.nodeIds.length === 0) return
    const next = {
      ...value,
      nodes: value.nodes.map((node) => {
        if (!selection.nodeIds.includes(node.id) || node.type !== 'image') return node
        const width = node.imageWidth ?? node.width
        const height = node.imageHeight ?? node.height
        return { ...node, width: Math.max(24, Math.round(width * scale)), height: Math.max(24, Math.round(height * scale)) }
      }),
    }
    emitChange(next, 'update-node')
  }, [emitChange, readOnly, selection.nodeIds, value])

  const openSelectedExternalNode = useCallback(() => {
    const target = selectedImageNode?.file ?? selectedImageNode?.url ?? selectedLinkNode?.url
    if (target) window.open(target, '_blank', 'noopener,noreferrer')
  }, [selectedImageNode, selectedLinkNode])

  const replaceSelectedImage = useCallback(async (file: File) => {
    if (readOnly || !selectedImageNode || !isImageFile(file)) return
    const previewUrl = URL.createObjectURL(file)
    const natural = await imageSize(previewUrl).catch(() => ({ width: selectedImageNode.width, height: selectedImageNode.height }))
    const size = fitImageSize(natural.width, natural.height)
    emitChange({
      ...value,
      nodes: value.nodes.map((node) => node.id === selectedImageNode.id
        ? ({ ...node, file: previewUrl, label: file.name, width: size.width, height: size.height, imageWidth: natural.width, imageHeight: natural.height, imageStatus: onUpload ? 'uploading' : undefined } as CanvasNode<NodeExtra>)
        : node),
    }, 'update-node')

    if (!onUpload) {
      if (!allowInlineImages) onExternalContentWarning?.({ code: 'missing-upload-handler', message: 'Replacing images requires an onUpload handler.', file })
      return
    }

    try {
      const url = await onUpload(file)
      URL.revokeObjectURL(previewUrl)
      const current = valueRef.current
      onChange({
        ...current,
        nodes: current.nodes.map((node) => {
          if (node.id !== selectedImageNode.id) return node
          const next = { ...node, file: url }
          delete next.imageStatus
          delete next.imageError
          return next
        }),
      }, { reason: 'update-node' })
    } catch (error) {
      const current = valueRef.current
      onChange({
        ...current,
        nodes: current.nodes.map((node) => node.id === selectedImageNode.id
          ? ({ ...node, imageStatus: 'failed', imageError: error instanceof Error ? error.message : 'Upload failed' } as CanvasNode<NodeExtra>)
          : node),
      }, { reason: 'update-node' })
    }
  }, [allowInlineImages, emitChange, onChange, onExternalContentWarning, onUpload, readOnly, selectedImageNode, value])

  const duplicateCurrentSelection = useCallback(() => {
    if (readOnly || selection.nodeIds.length === 0) return
    const result = duplicateSelection(value, selection)
    emitChange(result.document, 'duplicate')
    emitSelection(result.selection)
  }, [emitChange, emitSelection, readOnly, selection, value])

  const expandNodeIdsForGroups = useCallback((nodeIds: readonly string[]): string[] => {
    const expanded = new Set(nodeIds)
    for (const node of value.nodes) {
      if (node.groupId && expanded.has(node.groupId)) expanded.add(node.id)
    }
    return [...expanded]
  }, [value.nodes])

  const createEdgeBetween = useCallback(
    (fromNodeId: string, toNodeId: string, partial: Partial<CanvasEdge<EdgeExtra>> = {}) => {
      if (readOnly || fromNodeId === toNodeId) return null
      const fromNode = nodeById.get(fromNodeId)
      const toNode = nodeById.get(toNodeId)
      if (!fromNode || !toNode) return null
      const defaults = defaultEdgeConnection(fromNode, toNode)
      const fromSide = partial.fromAnchor?.side ?? partial.fromSide ?? defaults.fromSide
      const toSide = partial.toAnchor?.side ?? partial.toSide ?? defaults.toSide
      const style = { ...(defaults.style ?? {}), ...(partial.style ?? {}) }
      const edgePartial = {
        ...defaults,
        ...partial,
        fromSide,
        toSide,
        fromAnchor: partial.fromAnchor ?? (partial.fromSide ? defaultEdgeAnchorForSide(fromNode, partial.fromSide) : defaults.fromAnchor),
        toAnchor: partial.toAnchor ?? (partial.toSide ? defaultEdgeAnchorForSide(toNode, partial.toSide) : defaults.toAnchor),
        ...(Object.keys(style).length > 0 ? { style } : {}),
      } as Partial<CanvasEdge<EdgeExtra>>
      const edge = createCanvasEdge<EdgeExtra>(fromNodeId, toNodeId, edgePartial)
      emitChange({ ...value, edges: [...value.edges, edge] }, 'create-edge')
      emitSelection({ nodeIds: [], edgeIds: [edge.id] })
      return edge
    },
    [emitChange, emitSelection, nodeById, readOnly, value],
  )

  const createMindMapNode = useCallback((kind: 'child' | 'sibling', side?: 'left' | 'right') => {
    if (readOnly || selection.nodeIds.length !== 1) return false
    const selectedNodeId = selection.nodeIds[0] ?? ''
    const selectedNode = nodeById.get(selectedNodeId)
    if (!selectedNode || selectedNode.type === 'group' || selectedNode.type === 'image' || selectedNode.type === 'link') return false
    const incoming = value.edges.find((edge) => edge.toNode === selectedNode.id)
    const parentId = kind === 'sibling' && incoming ? incoming.fromNode : selectedNode.id
    const parentNode = nodeById.get(parentId)
    if (!parentNode) return false

    const parentCenter = { x: parentNode.x + parentNode.width / 2, y: parentNode.y + parentNode.height / 2 }
    const selectedCenter = { x: selectedNode.x + selectedNode.width / 2, y: selectedNode.y + selectedNode.height / 2 }
    const branchReferenceNode = kind === 'child' && incoming ? nodeById.get(incoming.fromNode) : parentNode
    const branchReferenceCenter = branchReferenceNode ? { x: branchReferenceNode.x + branchReferenceNode.width / 2, y: branchReferenceNode.y + branchReferenceNode.height / 2 } : parentCenter
    const branchSide = side ?? (selectedCenter.x < branchReferenceCenter.x ? 'left' : 'right')
    const label = 'New idea'
    const size = textNoteSize(label, selectedNode.style?.fontSize ?? 14)
    const newNode = createCanvasNode<NodeExtra>({
      id: createId('idea'),
      type: 'text',
      text: label,
      shape: 'text',
      groupId: selectedNode.groupId,
      x: branchSide === 'left' ? parentNode.x - 160 - size.width : parentNode.x + parentNode.width + 160,
      y: parentCenter.y - size.height / 2,
      width: size.width,
      height: size.height,
    } as Partial<CanvasNode<NodeExtra>>)
    const edge = createCanvasEdge<EdgeExtra>(parentId, newNode.id, {
      id: createId('branch'),
      fromEnd: 'none',
      toEnd: 'none',
      style: { routing: 'curved' },
    } as Partial<CanvasEdge<EdgeExtra>>)
    const next = layoutMindMap({ ...value, nodes: [...value.nodes, newNode], edges: [...value.edges, edge] })
    emitChange(next, 'create-node')
    emitSelection({ nodeIds: [newNode.id], edgeIds: [] })
    setEditingNodeId(newNode.id)
    requestAnimationFrame(() => rootRef.current?.focus())
    return true
  }, [emitChange, emitSelection, nodeById, readOnly, selection.nodeIds, value])

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

  const openShapeSwitcher = useCallback(() => {
    if (readOnly || selection.nodeIds.length === 0) return false
    const nodes = selection.nodeIds.reduce<Array<CanvasNode<NodeExtra>>>((next, nodeId) => {
      const node = nodeById.get(nodeId)
      if (node && node.type !== 'group' && node.type !== 'image' && node.type !== 'link') next.push(node)
      return next
    }, [])
    const bounds = boundsForNodes(nodes)
    const root = rootRef.current
    if (!bounds || !root) return false
    const x = bounds.x + bounds.width / 2
    const y = bounds.y - 12
    setContextMenu(null)
    setShapeSwitcher({
      x: Math.max(12, Math.min(root.clientWidth - 12, x * viewport.zoom + viewport.x)),
      y: Math.max(12, y * viewport.zoom + viewport.y),
    })
    return true
  }, [nodeById, readOnly, selection.nodeIds, viewport])

  const applyShapeToSelection = useCallback((shape: CanvasShape) => {
    if (readOnly || selection.nodeIds.length === 0) return
    emitChange({
      ...value,
      nodes: value.nodes.map((node) => (
        selection.nodeIds.includes(node.id) && node.type !== 'group' && node.type !== 'image' && node.type !== 'link'
          ? { ...node, shape }
          : node
      )),
    }, 'update-node')
    setShapeSwitcher(null)
    rootRef.current?.focus()
  }, [emitChange, readOnly, selection.nodeIds, value])

  const moveSelectedNodesByKeyboard = useCallback(
    (direction: AddDirection) => {
      if (readOnly || selection.nodeIds.length === 0) return false
      const amount = snapToGrid ? gridSize : 10
      const dx = direction === 'left' ? -amount : direction === 'right' ? amount : 0
      const dy = direction === 'top' ? -amount : direction === 'bottom' ? amount : 0
      const movedNodeIds = expandNodeIdsForGroups(selection.nodeIds).filter((nodeId) => !nodeById.get(nodeId)?.locked)
      if (movedNodeIds.length === 0) return false
      const moved = movedNodeIds.reduce<JsonCanvasDocument<NodeExtra, EdgeExtra>>((document, nodeId) => (
        updateNode(document, nodeId, (node) => ({ ...node, x: node.x + dx, y: node.y + dy }))
      ), value)
      const movedSet = new Set(movedNodeIds)
      const changedGroups = new Set(moved.nodes.flatMap((node) => node.groupId && movedSet.has(node.id) && !movedSet.has(node.groupId) ? [node.groupId] : []))
      emitChange(recenterMovedNodeEdges(fitGroupsToChildren(moved, changedGroups), movedNodeIds), 'move-node')
      return true
    },
    [emitChange, expandNodeIdsForGroups, gridSize, nodeById, readOnly, selection.nodeIds, snapToGrid, value],
  )

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
        fromAnchor: defaultEdgeAnchorForSide(sourceNode, direction),
        toAnchor: defaultEdgeAnchorForSide(node, oppositeSide(direction)),
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

  const updateEdgeSegment = useCallback(
    (edgeId: string, segmentIndex: number, originalPoints: Point[], startPoint: Point, point: Point) => {
      if (readOnly || originalPoints.length < 2) return
      const dx = point.x - startPoint.x
      const dy = point.y - startPoint.y
      const nextPoints = moveOrthogonalRouteSegment(originalPoints, segmentIndex, { x: dx, y: dy })
      const nextEdges = value.edges.map((edge) => {
        if (edge.id !== edgeId) return edge
        const fromNode = nodeById.get(edge.fromNode)
        const toNode = nodeById.get(edge.toNode)
        if (!fromNode || !toNode || nextPoints.length < 2) return edge

        const waypoints = nextPoints.slice(1, -1).map((routePoint) => ({ ...routePoint }))
        return { ...edge, waypoints }
      })
      emitChange({ ...value, edges: nextEdges }, 'update-edge')
    },
    [emitChange, nodeById, readOnly, value],
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

  const groupCurrentSelection = useCallback(() => {
    if (readOnly) return null
    const result = groupSelectionInDocument(value, selection)
    if (!result.group) return null
    emitChange(result.document, 'update-node')
    emitSelection(result.selection)
    return result.group
  }, [emitChange, emitSelection, readOnly, selection, value])

  const ungroupCurrentSelection = useCallback(() => {
    if (readOnly) return
    emitChange(ungroupSelectionInDocument(value, selection), 'update-node')
    emitSelection({ nodeIds: [], edgeIds: [] })
  }, [emitChange, emitSelection, readOnly, selection, value])

  const bringCurrentSelectionForward = useCallback(() => {
    if (readOnly || selection.nodeIds.length === 0) return
    emitChange(bringSelectionForward(value, selection), 'update-node')
  }, [emitChange, readOnly, selection, value])

  const sendCurrentSelectionBackward = useCallback(() => {
    if (readOnly || selection.nodeIds.length === 0) return
    emitChange(sendSelectionBackward(value, selection), 'update-node')
  }, [emitChange, readOnly, selection, value])

  const bringCurrentSelectionToFront = useCallback(() => {
    if (readOnly || selection.nodeIds.length === 0) return
    emitChange(bringSelectionToFront(value, selection), 'update-node')
  }, [emitChange, readOnly, selection, value])

  const sendCurrentSelectionToBack = useCallback(() => {
    if (readOnly || selection.nodeIds.length === 0) return
    emitChange(sendSelectionToBack(value, selection), 'update-node')
  }, [emitChange, readOnly, selection, value])

  const alignCurrentSelection = useCallback((alignment: CanvasAlignment) => {
    if (readOnly || selection.nodeIds.length < 2) return
    emitChange(recenterMovedNodeEdges(alignSelectionInDocument(value, selection, alignment), selection.nodeIds), 'move-node')
  }, [emitChange, readOnly, selection, value])

  const distributeCurrentSelection = useCallback((distribution: CanvasDistribution) => {
    if (readOnly || selection.nodeIds.length < 3) return
    emitChange(recenterMovedNodeEdges(distributeSelectionInDocument(value, selection, distribution), selection.nodeIds), 'move-node')
  }, [emitChange, readOnly, selection, value])

  const exportDocumentForArea = useCallback((area: ExportArea): JsonCanvasDocument<NodeExtra, EdgeExtra> => {
    if (area === 'canvas' || (selection.nodeIds.length === 0 && selection.edgeIds.length === 0)) return value
    const nodeIds = new Set(selection.nodeIds)
    const edges = value.edges.filter((edge) => selection.edgeIds.includes(edge.id) || (nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode)))
    for (const edge of edges) {
      nodeIds.add(edge.fromNode)
      nodeIds.add(edge.toNode)
    }
    return {
      nodes: value.nodes.filter((node) => nodeIds.has(node.id)),
      edges,
    }
  }, [selection.edgeIds, selection.nodeIds, value])

  const exportSvgWithOptions = useCallback((options: ExportOptions): string => {
    const exportDocument = exportDocumentForArea(options.area)
    const bounds = canvasBounds(exportDocument.nodes, 80)
    const defaultColor = options.colorMode === 'dark' ? '#f4f4f5' : '#111827'
    const background = options.colorMode === 'dark' ? '#151515' : '#ffffff'
    const nodes = new Map(exportDocument.nodes.map((node) => [node.id, node]))
    const markerMarkup = exportDocument.edges
      .filter((edge) => (edge.toEnd ?? 'arrow') === 'arrow')
      .map((edge) => {
        const stroke = edge.style?.stroke ?? edge.color ?? defaultColor
        return `<marker id="arrow-${escapeXml(edge.id)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}" /></marker>`
      })
      .join('\n')
    const edgeMarkup = exportDocument.edges.map((edge) => {
      const fromNode = nodes.get(edge.fromNode)
      const toNode = nodes.get(edge.toNode)
      if (!fromNode || !toNode) return ''
      const path = edgePath(edge, fromNode, toNode)
      const stroke = edge.style?.stroke ?? edge.color ?? defaultColor
      const strokeWidth = edge.style?.strokeWidth ?? 1.5
      const dash = edgeDash(edge) ? ` stroke-dasharray="${edgeDash(edge)}"` : ''
      const marker = (edge.toEnd ?? 'arrow') === 'arrow' ? ` marker-end="url(#arrow-${escapeXml(edge.id)})"` : ''
      const labelPoint = edge.label ? edgeLabelPoint(edge, fromNode, toNode) : null
      const label = edge.label && labelPoint
        ? svgText(edge.label, labelPoint.x, labelPoint.y, { color: defaultColor, fontSize: 12, fontWeight: 500, textAnchor: 'middle' })
        : ''
      return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}${marker} />\n${label}`
    }).join('\n')
    const nodeMarkup = exportDocument.nodes.map((node) => {
      const shape = svgShapeForNode(node, defaultColor)
      const label = nodeLabel(node)
      const textColor = node.style?.text ?? defaultColor
      const fontSize = node.style?.fontSize ?? 14
      const fontWeight = node.style?.fontWeight ?? 500
      const textAnchor: 'start' | 'middle' | 'end' = node.style?.textAlign === 'left' ? 'start' : node.style?.textAlign === 'right' ? 'end' : 'middle'
      const textX = node.style?.textAlign === 'left' ? node.x + 12 : node.style?.textAlign === 'right' ? node.x + node.width - 12 : node.x + node.width / 2
      const textY = node.type === 'group' ? node.y - 8 : node.y + node.height / 2
      const textOptions = { color: textColor, fontSize, fontWeight, textAnchor }
      const text = label ? svgText(label, textX, textY, node.type === 'group' ? textOptions : { ...textOptions, maxWidth: Math.max(24, node.width - 24) }) : ''
      return `${shape}\n${text}`
    }).join('\n')
    const backgroundMarkup = options.background === 'solid'
      ? `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${background}" />`
      : `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="transparent" />`
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">
<defs>${markerMarkup}</defs>
${backgroundMarkup}
${edgeMarkup}
${nodeMarkup}
</svg>`
  }, [exportDocumentForArea])

  const exportPngWithOptions = useCallback(async (options: ExportOptions): Promise<string> => {
    const svg = exportSvgWithOptions(options)
    const bounds = canvasBounds(exportDocumentForArea(options.area).nodes, 80)
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = reject
      })
      image.src = url
      await loaded
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(bounds.width * options.quality))
      canvas.height = Math.max(1, Math.ceil(bounds.height * options.quality))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not create canvas context')
      context.scale(options.quality, options.quality)
      context.drawImage(image, 0, 0)
      return canvas.toDataURL('image/png')
    } finally {
      URL.revokeObjectURL(url)
    }
  }, [exportDocumentForArea, exportSvgWithOptions])

  const exportSvg = useCallback((): string => exportSvgWithOptions(exportOptions), [exportOptions, exportSvgWithOptions])

  const exportPng = useCallback(async (): Promise<string> => exportPngWithOptions(exportOptions), [exportOptions, exportPngWithOptions])

  const downloadExport = useCallback(async (options: ExportOptions) => {
    const anchor = document.createElement('a')
    if (options.fileType === 'svg') {
      const blob = new Blob([exportSvgWithOptions(options)], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      anchor.href = url
      anchor.download = 'minucanvas.svg'
      anchor.click()
      URL.revokeObjectURL(url)
      return
    }
    anchor.href = await exportPngWithOptions(options)
    anchor.download = 'minucanvas.png'
    anchor.click()
  }, [exportPngWithOptions, exportSvgWithOptions])

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
    groupSelection: groupCurrentSelection,
    ungroupSelection: ungroupCurrentSelection,
    bringSelectionForward: bringCurrentSelectionForward,
    sendSelectionBackward: sendCurrentSelectionBackward,
    bringSelectionToFront: bringCurrentSelectionToFront,
    sendSelectionToBack: sendCurrentSelectionToBack,
    alignSelection: alignCurrentSelection,
    distributeSelection: distributeCurrentSelection,
    exportSvg,
    exportPng,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(-ZOOM_STEP),
    resetView,
    fitView,
  }), [alignCurrentSelection, bringCurrentSelectionForward, bringCurrentSelectionToFront, createEdgeBetween, deleteCurrentSelection, distributeCurrentSelection, emitChange, emitSelection, exportPng, exportSvg, fitView, groupCurrentSelection, resetView, selection, sendCurrentSelectionBackward, sendCurrentSelectionToBack, setActiveTool, ungroupCurrentSelection, value, zoomBy])

  useEffect(() => {
    if (autoFocus) rootRef.current?.focus()
  }, [autoFocus])

  useLayoutEffect(() => {
    if (!contextMenu) return
    const root = rootRef.current
    const menu = contextMenuRef.current
    if (!root || !menu) return
    const padding = 8
    const nextX = Math.min(contextMenu.x, root.clientWidth - menu.offsetWidth - padding)
    const nextY = Math.min(contextMenu.y, root.clientHeight - menu.offsetHeight - padding)
    const clamped = {
      x: Math.max(padding, nextX),
      y: Math.max(padding, nextY),
    }
    if (clamped.x !== contextMenu.x || clamped.y !== contextMenu.y) setContextMenu(clamped)
  }, [contextMenu])

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
    setContextMenu(null)
    setShapeSwitcher(null)
    rootRef.current?.focus()
    const interactionNode = activeTool === 'select' && node.groupId && activeGroupId !== node.groupId
      ? nodeById.get(node.groupId) ?? node
      : node

    if (activeTool === 'select' && event.shiftKey) {
      const nextNodeIds = selection.nodeIds.includes(interactionNode.id)
        ? selection.nodeIds.filter((id) => id !== interactionNode.id)
        : [...selection.nodeIds, interactionNode.id]
      emitSelection({ nodeIds: nextNodeIds, edgeIds: [] })
      return
    }

    if (event.shiftKey || panningModifierActive) {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = {
        kind: 'pan',
        startClient: { x: event.clientX, y: event.clientY },
        startViewport: viewport,
      }
      return
    }

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
        ? selection.nodeIds.filter((id) => id !== interactionNode.id)
        : [...selection.nodeIds, interactionNode.id]
      : selection.nodeIds.includes(interactionNode.id)
        ? selection.nodeIds
        : [interactionNode.id]
    const nextSelection = { nodeIds: nextNodeIds, edgeIds: [] }
    emitSelection(nextSelection)

    const dragNodeIds = expandNodeIdsForGroups(nextSelection.nodeIds).filter((id) => !nodeById.get(id)?.locked)
    const originals = new Map<string, CanvasNode<NodeExtra>>()
    for (const id of dragNodeIds) {
      const selectedNode = nodeById.get(id)
      if (selectedNode) originals.set(id, selectedNode)
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    undoTransactionRef.current = cloneCanvas(value)
    undoTransactionPushedRef.current = false
    dragRef.current = {
      kind: 'nodes',
      startPoint: pointFromEvent(event),
      nodeIds: dragNodeIds,
      originals,
    }
  }, [activeGroupId, activeTool, connectorAnchorAtPoint, createEdgeBetween, emitSelection, expandNodeIdsForGroups, nodeById, pendingConnectorAnchor, panningModifierActive, pointFromEvent, readOnly, selection.nodeIds, viewport])

  const handleSurfacePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setContextMenu(null)
    setShapeSwitcher(null)
    setActiveGroupId(null)
    rootRef.current?.focus()
    setEditingEdgeId(null)
    if (event.button === 1 || activeTool === 'hand' || event.altKey || event.shiftKey || panningModifierActive) {
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

    if (activeTool === 'select') {
      const point = pointFromEvent(event)
      const additive = event.shiftKey || event.metaKey || event.ctrlKey
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = {
        kind: 'selection-box',
        startPoint: point,
        pointer: point,
        additive,
        originalSelection: selection,
      }
      if (!additive) emitSelection({ nodeIds: [], edgeIds: [] })
      forcePointerFrame((frame) => frame + 1)
      return
    }

    emitSelection({ nodeIds: [], edgeIds: [] })
  }, [activeTool, connectorAnchorAtPoint, createEdgeBetween, createNodeAt, emitSelection, pendingConnectorAnchor, panningModifierActive, pointFromEvent, readOnly, selection, viewport])

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

    if (drag.kind === 'edge-segment') {
      updateEdgeSegment(drag.edgeId, drag.segmentIndex, drag.originalPoints, drag.startPoint, point)
      return
    }

    if (drag.kind === 'selection-box') {
      const nextDrag = { ...drag, pointer: point }
      dragRef.current = nextDrag
      const box = rectFromPoints(nextDrag.startPoint, nextDrag.pointer)
      const boxNodeIds = [...new Set(value.nodes
        .filter((node) => rectsOverlap(box, node))
        .flatMap((node) => {
          if (activeGroupId) {
            if (node.groupId === activeGroupId) return [node.id]
            return []
          }
          return [node.groupId ?? node.id]
        }))]
      const boxEdgeIds = value.edges.filter((edge) => {
        const fromNode = nodeById.get(edge.fromNode)
        const toNode = nodeById.get(edge.toNode)
        if (!fromNode || !toNode) return false
        const fromSide = edge.fromSide ?? sideForPoint(fromNode, { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 })
        const toSide = edge.toSide ?? sideForPoint(toNode, { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 })
        const fromPoint = anchorForEdgeAnchor(fromNode, edge.fromAnchor ?? defaultEdgeAnchorForSide(fromNode, fromSide))
        const toPoint = anchorForEdgeAnchor(toNode, edge.toAnchor ?? defaultEdgeAnchorForSide(toNode, toSide))
        return rectsOverlap(box, rectFromLine(fromPoint, toPoint, 10))
      }).map((edge) => edge.id)
      emitSelection({
        nodeIds: nextDrag.additive ? [...new Set([...nextDrag.originalSelection.nodeIds, ...boxNodeIds])] : boxNodeIds,
        edgeIds: nextDrag.additive ? [...new Set([...nextDrag.originalSelection.edgeIds, ...boxEdgeIds])] : boxEdgeIds,
      })
      forcePointerFrame((frame) => frame + 1)
      return
    }

    if (drag.kind === 'resize-node') {
      const dx = point.x - drag.startPoint.x
      const dy = point.y - drag.startPoint.y
      const rect = resizeNodeRect(drag.original, drag.handle, dx, dy, snapToGrid, gridSize)
      const resized = drag.original.type === 'group'
        ? value.nodes.reduce<JsonCanvasDocument<NodeExtra, EdgeExtra>>((document, node) => {
            if (node.id === drag.nodeId) return updateNode(document, node.id, (current) => ({ ...current, ...rect }))
            const childOriginal = drag.childOriginals.get(node.id)
            if (!childOriginal) return document
            const scaleX = rect.width / drag.original.width
            const scaleY = rect.height / drag.original.height
            return updateNode(document, node.id, (current) => ({
              ...current,
              x: rect.x + (childOriginal.x - drag.original.x) * scaleX,
              y: rect.y + (childOriginal.y - drag.original.y) * scaleY,
              width: Math.max(MIN_NODE_SIZE, childOriginal.width * scaleX),
              height: Math.max(MIN_NODE_SIZE, childOriginal.height * scaleY),
            }))
          }, value)
        : updateNode(value, drag.nodeId, (node) => ({ ...node, ...rect }))
      const resizedNode = resized.nodes.find((node) => node.id === drag.nodeId)
      const childIds = [...drag.childOriginals.keys()]
      const fitted = drag.original.type === 'group'
        ? resized
        : fitGroupsToChildren(resized, resizedNode?.groupId ? [resizedNode.groupId] : [])
      emitChange(
        recenterMovedNodeEdges(
          fitted,
          [drag.nodeId, ...childIds],
        ),
        'update-node',
      )
      return
    }

    const dx = point.x - drag.startPoint.x
    const dy = point.y - drag.startPoint.y
    const draggedOriginals = drag.nodeIds.flatMap((nodeId) => {
      const original = drag.originals.get(nodeId)
      return original ? [original] : []
    })
    const preliminaryNodes = draggedOriginals.map((original) => {
      const nextPosition = snapToGrid
        ? snapPoint({ x: original.x + dx, y: original.y + dy }, gridSize)
        : { x: original.x + dx, y: original.y + dy }
      return { ...original, x: nextPosition.x, y: nextPosition.y }
    })
    const preliminaryBounds = boundsForNodes(preliminaryNodes)
    const guideSnap = preliminaryBounds
      ? snapMovingBoundsToGuides(
          preliminaryBounds,
          value.nodes.filter((node) => !drag.nodeIds.includes(node.id)),
          6 / viewport.zoom,
        )
      : { dx: 0, dy: 0, guides: [] }
    setAlignmentGuides(guideSnap.guides)
    const guideDx = snapToGrid ? 0 : guideSnap.dx
    const guideDy = snapToGrid ? 0 : guideSnap.dy
    const moved = drag.nodeIds.reduce<JsonCanvasDocument<NodeExtra, EdgeExtra>>((document, nodeId) => {
      const original = drag.originals.get(nodeId)
      if (!original) return document
      const nextPosition = snapToGrid
        ? snapPoint({ x: original.x + dx, y: original.y + dy }, gridSize)
        : { x: original.x + dx + guideDx, y: original.y + dy + guideDy }
      return updateNode(document, nodeId, (node) => ({ ...node, x: nextPosition.x, y: nextPosition.y }))
    }, value)
    const movedSet = new Set(drag.nodeIds)
    const changedGroups = new Set(moved.nodes.flatMap((node) => node.groupId && movedSet.has(node.id) && !movedSet.has(node.groupId) ? [node.groupId] : []))
    emitChange(recenterMovedNodeEdges(fitGroupsToChildren(moved, changedGroups), drag.nodeIds), 'move-node')
  }, [activeGroupId, connectorAnchorAtPoint, emitChange, gridSize, nodeById, pointFromEvent, setViewport, snapToGrid, updateEdgeAnchor, updateEdgeSegment, value, viewport.zoom])

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setAlignmentGuides([])
    undoTransactionRef.current = null
    undoTransactionPushedRef.current = false
    forcePointerFrame((frame) => frame + 1)
    if (!drag) return
    if (drag.kind === 'selection-box') {
      const box = rectFromPoints(drag.startPoint, drag.pointer)
      if (box.width < 3 && box.height < 3 && !drag.additive) emitSelection({ nodeIds: [], edgeIds: [] })
      return
    }
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

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop()
    if (!previous) return false
    redoStackRef.current = [...redoStackRef.current.slice(-99), cloneCanvas(value)]
    onChange(previous, { reason: 'programmatic' })
    emitSelection({ nodeIds: [], edgeIds: [] })
    return true
  }, [emitSelection, onChange, value])

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop()
    if (!next) return false
    undoStackRef.current = [...undoStackRef.current.slice(-99), cloneCanvas(value)]
    onChange(next, { reason: 'programmatic' })
    emitSelection({ nodeIds: [], edgeIds: [] })
    return true
  }, [emitSelection, onChange, value])

  const copyCurrentSelection = useCallback(() => {
    const copiedNodeIds = new Set(selection.nodeIds)
    for (const edge of value.edges) {
      if (selection.edgeIds.includes(edge.id)) {
        copiedNodeIds.add(edge.fromNode)
        copiedNodeIds.add(edge.toNode)
      }
    }

    const nodes = value.nodes
      .filter((node) => copiedNodeIds.has(node.id))
      .map((node) => ({ ...node, style: node.style ? { ...node.style } : undefined })) as Array<CanvasNode<NodeExtra>>
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edges = value.edges
      .filter((edge) => (selection.edgeIds.includes(edge.id) || (selection.nodeIds.includes(edge.fromNode) && selection.nodeIds.includes(edge.toNode))) && nodeIds.has(edge.fromNode) && nodeIds.has(edge.toNode))
      .map((edge) => ({ ...edge, style: edge.style ? { ...edge.style } : undefined })) as Array<CanvasEdge<EdgeExtra>>

    if (nodes.length === 0 && edges.length === 0) return false
    const payload = { nodes, edges }
    clipboardRef.current = payload
    navigator.clipboard?.writeText(JSON.stringify({ type: 'application/x-minucanvas-selection', ...payload })).catch(() => undefined)
    return true
  }, [selection.edgeIds, selection.nodeIds, value.edges, value.nodes])

  const pasteClipboard = useCallback(() => {
    const payload = clipboardRef.current
    if (!payload || payload.nodes.length === 0) return false

    const idMap = new Map<string, string>()
    const nextNodes = payload.nodes.map((node) => {
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
    const nextEdges = payload.edges
      .filter((edge) => idMap.has(edge.fromNode) && idMap.has(edge.toNode))
      .map((edge) => ({
        ...edge,
        id: createId('edge'),
        fromNode: idMap.get(edge.fromNode) ?? edge.fromNode,
        toNode: idMap.get(edge.toNode) ?? edge.toNode,
        style: edge.style ? { ...edge.style } : undefined,
      })) as Array<CanvasEdge<EdgeExtra>>

    emitChange({ nodes: [...value.nodes, ...nextNodes], edges: [...value.edges, ...nextEdges] }, 'paste')
    emitSelection({ nodeIds: nextNodes.map((node) => node.id), edgeIds: nextEdges.map((edge) => edge.id) })
    return true
  }, [emitChange, emitSelection, value.edges, value.nodes])

  const createExternalNodeAt = useCallback(async (input: { text?: string; file?: File; point: Point }) => {
    if (readOnly) return false
    const point = snapToGrid ? snapPoint(input.point, gridSize) : input.point
    let partial: Partial<CanvasNode<NodeExtra>> | null = null

    if (input.file) {
      if (!isImageFile(input.file)) {
        onExternalContentWarning?.({ code: 'unsupported-file', message: `Unsupported file type: ${input.file.type || input.file.name}`, file: input.file })
        return false
      }

      const previewUrl = URL.createObjectURL(input.file)
      const natural = await imageSize(previewUrl).catch(() => ({ width: 640, height: 360 }))
      const size = fitImageSize(natural.width, natural.height)
      let src = previewUrl
      if (!onUpload && allowInlineImages) {
        onExternalContentWarning?.({ code: 'inline-image-fallback', message: 'No upload handler configured. Inlining image as a data URL.', file: input.file })
        src = await fileToDataUrl(input.file)
        URL.revokeObjectURL(previewUrl)
      } else if (!onUpload && !allowInlineImages) {
        URL.revokeObjectURL(previewUrl)
        onExternalContentWarning?.({ code: 'missing-upload-handler', message: 'Pasted images require an onUpload handler.', file: input.file })
        return false
      }

      const node = createCanvasNode<NodeExtra>({
        type: 'image',
        file: src,
        label: input.file.name,
        shape: 'rectangle',
        width: size.width,
        height: size.height,
        imageWidth: natural.width,
        imageHeight: natural.height,
        imageStatus: onUpload ? 'uploading' : undefined,
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
      } as Partial<CanvasNode<NodeExtra>>)
      const documentWithPreview = { ...value, nodes: [...value.nodes, node] }
      emitChange(documentWithPreview, 'create-node')
      emitSelection({ nodeIds: [node.id], edgeIds: [] })
      setActiveTool('select')

      if (onUpload) {
        void onUpload(input.file)
          .then((url) => {
            URL.revokeObjectURL(previewUrl)
            const current = valueRef.current.nodes.some((currentNode) => currentNode.id === node.id)
              ? valueRef.current
              : documentWithPreview
            onChange({
              ...current,
              nodes: current.nodes.map((currentNode) => {
                if (currentNode.id !== node.id) return currentNode
                const next = { ...currentNode, file: url }
                delete next.imageStatus
                delete next.imageError
                return next
              }),
            }, { reason: 'update-node' })
          })
          .catch((error: unknown) => {
            const current = valueRef.current.nodes.some((currentNode) => currentNode.id === node.id)
              ? valueRef.current
              : documentWithPreview
            onChange({
              ...current,
              nodes: current.nodes.map((currentNode) => currentNode.id === node.id
                ? ({ ...currentNode, imageStatus: 'failed', imageError: error instanceof Error ? error.message : 'Upload failed' } as CanvasNode<NodeExtra>)
                : currentNode),
            }, { reason: 'update-node' })
          })
      }
      return true
    } else if (input.text) {
      const text = input.text.trim()
      if (!text) return false
      if (isUrlText(text)) {
        if (isImageUrl(text)) {
          const natural = await imageSize(text).catch(() => ({ width: 640, height: 360 }))
          const size = fitImageSize(natural.width, natural.height)
          partial = { type: 'image', file: text, label: text.split('/').pop() ?? text, shape: 'rectangle', width: size.width, height: size.height, imageWidth: natural.width, imageHeight: natural.height } as Partial<CanvasNode<NodeExtra>>
        } else {
          const label = linkLabelFromUrl(text)
          const size = linkNodeSize(label)
          const node = createCanvasNode<NodeExtra>({
            type: 'link',
            url: text,
            label,
            shape: 'text',
            width: size.width,
            height: size.height,
            x: point.x - size.width / 2,
            y: point.y - size.height / 2,
          } as Partial<CanvasNode<NodeExtra>>)
          emitChange({ ...value, nodes: [...value.nodes, node] }, 'create-node')
          emitSelection({ nodeIds: [node.id], edgeIds: [] })
          setActiveTool('select')
          if (onResolveLink) {
            void onResolveLink(text).then((metadata) => {
              const resolvedLabel = metadata?.label
              if (!resolvedLabel) return
              const current = valueRef.current.nodes.some((currentNode) => currentNode.id === node.id) ? valueRef.current : { ...value, nodes: [...value.nodes, node] }
              onChange({
                ...current,
                nodes: current.nodes.map((currentNode) => {
                  if (currentNode.id !== node.id) return currentNode
                  const size = linkNodeSize(resolvedLabel)
                  return { ...currentNode, label: resolvedLabel, width: size.width, height: size.height }
                }),
              }, { reason: 'update-node' })
            }).catch(() => undefined)
          }
          return true
        }
      } else {
        partial = { type: 'text', text, shape: 'text', width: 240, height: Math.max(48, Math.min(180, text.split('\n').length * 28 + 20)) } as Partial<CanvasNode<NodeExtra>>
      }
    }

    if (!partial) return false
    const node = createCanvasNode<NodeExtra>({
      ...partial,
      x: point.x - (partial.width ?? 220) / 2,
      y: point.y - (partial.height ?? 120) / 2,
    } as Partial<CanvasNode<NodeExtra>>)
    emitChange({ ...value, nodes: [...value.nodes, node] }, 'create-node')
    emitSelection({ nodeIds: [node.id], edgeIds: [] })
    setActiveTool('select')
    return true
  }, [allowInlineImages, emitChange, emitSelection, gridSize, onChange, onExternalContentWarning, onResolveLink, onUpload, readOnly, setActiveTool, snapToGrid, value])

  const defaultExternalPastePoint = useCallback((): Point => {
    const root = rootRef.current
    if (!root) return { x: 0, y: 0 }
    const rect = root.getBoundingClientRect()
    return clientToCanvas({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, rect, viewport)
  }, [viewport])

  const handlePaste = useCallback((event: ClipboardEvent) => {
    if (readOnly || isEditableTarget(event.target)) return
    if (!event.clipboardData) return
    const items = Array.from(event.clipboardData.items)
    const fileItems = items.filter((item) => item.kind === 'file')
    const file = fileItems.map((item) => item.getAsFile()).find((item): item is File => Boolean(item && isImageFile(item)))
    if (file) {
      event.preventDefault()
      void createExternalNodeAt({ file, point: defaultExternalPastePoint() })
      return
    }
    const html = event.clipboardData.getData('text/html')
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const imageSrc = doc.querySelector('img[src]')?.getAttribute('src')
      const linkHref = doc.querySelector('a[href]')?.getAttribute('href')
      const external = imageSrc || linkHref
      if (external) {
        event.preventDefault()
        void createExternalNodeAt({ text: external, point: defaultExternalPastePoint() })
        return
      }
    }
    const text = event.clipboardData.getData('text/plain')
    if (text) {
      event.preventDefault()
      void createExternalNodeAt({ text, point: defaultExternalPastePoint() })
    }
  }, [createExternalNodeAt, defaultExternalPastePoint, readOnly])

  const handleDragOver = useCallback((event: DragEvent) => {
    if (readOnly) return
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    if (!inside) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }, [readOnly])

  const handleDrop = useCallback((event: DragEvent) => {
    if (readOnly) return
    const root = rootRef.current
    if (!root || !event.dataTransfer) return
    const rect = root.getBoundingClientRect()
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    if (!inside) return
    const point = clientToCanvas({ x: event.clientX, y: event.clientY }, rect, viewport)
    const file = filesFromDataTransfer(event.dataTransfer).find((item) => isImageFile(item))
    if (file) {
      event.preventDefault()
      void createExternalNodeAt({ file, point })
      return
    }
    const text = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')
    if (text) {
      event.preventDefault()
      void createExternalNodeAt({ text, point })
    }
  }, [createExternalNodeAt, readOnly, viewport])

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault()

    if (!event.ctrlKey && !event.metaKey) {
      setViewport({
        ...viewport,
        x: viewport.x - event.deltaX,
        y: viewport.y - event.deltaY,
      })
      return
    }

    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const before = clientToCanvas({ x: event.clientX, y: event.clientY }, rect, viewport)
    const zoomFactor = Math.exp(-event.deltaY * 0.05)
    const nextZoom = clampZoom(viewport.zoom * zoomFactor)
    setViewport({
      zoom: nextZoom,
      x: event.clientX - rect.left - before.x * nextZoom,
      y: event.clientY - rect.top - before.y * nextZoom,
    })
  }, [setViewport, viewport])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('paste', handlePaste)
    document.addEventListener('dragenter', handleDragOver)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      root.removeEventListener('wheel', handleWheel)
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('dragenter', handleDragOver)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [handleDragOver, handleDrop, handlePaste, handleWheel])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!shortcuts || isEditableTarget(event.target)) return
    if (event.key === 'Shift' || event.key === ' ') {
      if (event.key === ' ') event.preventDefault()
      setPanningModifierActive(true)
      return
    }
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault()
      undo()
      return
    }
    if ((mod && event.key.toLowerCase() === 'z' && event.shiftKey) || (mod && event.key.toLowerCase() === 'y')) {
      event.preventDefault()
      redo()
      return
    }
    if (mod && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      copyCurrentSelection()
      return
    }
    if (mod && event.key.toLowerCase() === 'x' && !readOnly) {
      event.preventDefault()
      if (copyCurrentSelection()) deleteCurrentSelection()
      return
    }
    if (mod && event.key.toLowerCase() === 'v' && !readOnly && clipboardRef.current) {
      event.preventDefault()
      pasteClipboard()
      return
    }
    if (mod && event.key.toLowerCase() === 'g' && !readOnly) {
      event.preventDefault()
      if (event.shiftKey) ungroupCurrentSelection()
      else groupCurrentSelection()
      return
    }
    if (mod && event.key === ']' && !readOnly) {
      event.preventDefault()
      bringCurrentSelectionToFront()
      return
    }
    if (mod && event.key === '[' && !readOnly) {
      event.preventDefault()
      sendCurrentSelectionToBack()
      return
    }
    if (event.key === 'Escape') {
      setContextMenu(null)
      setShapeSwitcher(null)
      setActiveGroupId(null)
      setEditingNodeId(null)
      setEditingEdgeId(null)
      setPendingConnectorAnchor(null)
      emitSelection({ nodeIds: [], edgeIds: [] })
      setActiveTool('select')
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      if (interactionMode === 'mindmap' && selection.nodeIds.length === 1 && createMindMapNode('child')) return
      if (selection.nodeIds.length > 0 && openShapeSwitcher()) return
      cycleSelection(event.shiftKey)
      return
    }
    if ((event.key === 'Enter' || event.key === 'F2') && !readOnly) {
      if (interactionMode === 'mindmap' && event.key === 'Enter' && !event.altKey && !event.shiftKey && selection.nodeIds.length === 1 && createMindMapNode('sibling')) {
        event.preventDefault()
        return
      }
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
    const arrowDirection = directionFromArrowKey(event.key)
    if (!mod && event.altKey && !event.shiftKey && arrowDirection && navigateSelection(arrowDirection)) {
      event.preventDefault()
      return
    }
    if (!mod && !event.altKey && !event.shiftKey) {
      if (arrowDirection && selection.nodeIds.length > 0 && moveSelectedNodesByKeyboard(arrowDirection)) {
        event.preventDefault()
        return
      }
      if (arrowDirection && navigateSelection(arrowDirection)) {
        event.preventDefault()
        return
      }
    }
    if (mod && !readOnly && selection.nodeIds.length === 1) {
      const selectedNodeId = selection.nodeIds[0] ?? ''
      const direction = arrowDirection
      if (direction && interactionMode === 'mindmap') {
        event.preventDefault()
        if (direction === 'left' || direction === 'right') createMindMapNode('child', direction)
        return
      }
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
  }, [bringCurrentSelectionToFront, copyCurrentSelection, createConnectedNode, createMindMapNode, cycleSelection, deleteCurrentSelection, duplicateCurrentSelection, emitSelection, groupCurrentSelection, interactionMode, moveSelectedNodesByKeyboard, navigateSelection, nodeById, openShapeSwitcher, pasteClipboard, readOnly, redo, resetView, selection.edgeIds, selection.nodeIds, sendCurrentSelectionToBack, setActiveTool, shortcuts, undo, ungroupCurrentSelection, zoomBy])

  const handleKeyUp = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Shift' || event.key === ' ') setPanningModifierActive(false)
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setShapeSwitcher(null)
    rootRef.current?.focus()
    const target = event.target instanceof HTMLElement ? event.target : null
    const nodeElement = target?.closest<HTMLElement>('[data-minucanvas-node-id]')
    const edgeElement = target?.closest<HTMLElement>('[data-minucanvas-edge-id]')
    const rawNodeId = nodeElement?.dataset.minucanvasNodeId
    const rawNode = rawNodeId ? nodeById.get(rawNodeId) : null
    const nodeId = rawNode?.groupId && activeGroupId !== rawNode.groupId ? rawNode.groupId : rawNodeId
    const edgeId = edgeElement?.dataset.minucanvasEdgeId
    if (nodeId && !selection.nodeIds.includes(nodeId)) emitSelection({ nodeIds: [nodeId], edgeIds: [] })
    else if (edgeId && !selection.edgeIds.includes(edgeId)) emitSelection({ nodeIds: [], edgeIds: [edgeId] })
    const rect = rootRef.current?.getBoundingClientRect()
    setContextMenu({
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY,
    })
  }, [activeGroupId, emitSelection, nodeById, selection.edgeIds, selection.nodeIds])

  const handleNodeTextInput = useCallback((node: CanvasNode<NodeExtra>, element: HTMLElement) => {
    if (node.type !== 'text' || node.shape !== 'text') return
    const size = textNoteSize(editableText(element), node.style?.fontSize ?? 14)
    const nodeElement = element.closest<HTMLElement>('[data-minucanvas-node-id]')
    if (!nodeElement) return
    nodeElement.style.width = `${size.width}px`
    nodeElement.style.height = `${size.height}px`
  }, [])

  const handleNodeTextBlur = useCallback((node: CanvasNode<NodeExtra>, text: string) => {
    setEditingNodeId(null)
    if (readOnly) return
    const size = node.type === 'text' && node.shape === 'text' ? textNoteSize(text, node.style?.fontSize ?? 14) : null
    if (text === nodeLabel(node) && (!size || (size.width === node.width && size.height === node.height))) return
    emitChange(
      updateNode(value, node.id, (current) => {
        const next = { ...current }
        if (current.type === 'text') next.text = text
        if (current.type === 'group') next.label = text
        if (size && current.type === 'text' && current.shape === 'text') {
          next.width = size.width
          next.height = size.height
        }
        return next
      }),
      'update-node',
    )
  }, [emitChange, readOnly, value])

  const connectorPreview = dragRef.current?.kind === 'connector' ? dragRef.current : null
  const selectionBox = dragRef.current?.kind === 'selection-box' ? rectFromPoints(dragRef.current.startPoint, dragRef.current.pointer) : null
  const activeGroup = activeGroupId ? nodeById.get(activeGroupId) : null
  const worldStyle: CSSProperties = {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
  }
  const rootStyle: CSSProperties = {
    minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
    maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
    '--mc-grid-size': `${gridSize * viewport.zoom}px`,
    '--mc-grid-offset-x': `${viewport.x}px`,
    '--mc-grid-offset-y': `${viewport.y}px`,
  } as CSSProperties
  const activeCanvasTheme = canvasTheme ?? theme
  const themeClass = activeCanvasTheme === 'system' ? '' : ` minucanvas--theme-${activeCanvasTheme}`
  const shapeThemeClass = ` minucanvas--shape-${shapeTheme}`
  const selectedShapeNodes = selection.nodeIds.reduce<Array<CanvasNode<NodeExtra>>>((next, nodeId) => {
    const node = nodeById.get(nodeId)
    if (node && node.type !== 'group' && node.type !== 'image' && node.type !== 'link') next.push(node)
    return next
  }, [])
  const selectedShape = selectedShapeNodes.length > 0
    ? selectedShapeNodes.every((node) => (node.shape ?? 'rounded-rectangle') === (selectedShapeNodes[0]?.shape ?? 'rounded-rectangle'))
      ? selectedShapeNodes[0]?.shape ?? 'rounded-rectangle'
      : null
    : null

  return (
    <div
      ref={rootRef}
      className={`minucanvas${grid ? ' minucanvas--grid' : ''}${readOnly ? ' minucanvas--readonly' : ''}${themeClass}${shapeThemeClass}${className ? ` ${className}` : ''}`}
      data-tool={activeTool}
      data-panning={activeTool === 'hand' || panningModifierActive ? 'true' : undefined}
      data-minucanvas
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onContextMenu={handleContextMenu}
      onBlur={() => setPanningModifierActive(false)}
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="application"
      aria-label="Canvas editor"
      tabIndex={0}
      style={rootStyle}
    >
      <div className="minucanvas-world" style={worldStyle}>
        {selectionBox ? <div className="minucanvas-selection-box" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} /> : null}
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
                  data-minucanvas-edge-id={edge.id}
                  d={path}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    const additive = event.shiftKey || event.metaKey || event.ctrlKey
                    emitSelection(additive
                      ? {
                          nodeIds: selection.nodeIds,
                          edgeIds: selection.edgeIds.includes(edge.id)
                            ? selection.edgeIds.filter((id) => id !== edge.id)
                            : [...selection.edgeIds, edge.id],
                        }
                      : { nodeIds: [], edgeIds: [edge.id] })
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
            const fromSide = edge.fromSide ?? sideForPoint(fromNode, { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 })
            const toSide = edge.toSide ?? sideForPoint(toNode, { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 })
            const fromAnchor = edge.fromAnchor ?? defaultEdgeAnchorForSide(fromNode, fromSide)
            const toAnchor = edge.toAnchor ?? defaultEdgeAnchorForSide(toNode, toSide)
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
                    undoTransactionRef.current = cloneCanvas(value)
                    undoTransactionPushedRef.current = false
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
                    undoTransactionRef.current = cloneCanvas(value)
                    undoTransactionPushedRef.current = false
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
              className={`minucanvas-node minucanvas-node--type-${node.type} ${nodeShapeClass(node)}${selected ? ' minucanvas-node--selected' : ''}${editing ? ' minucanvas-node--editing' : ''}${pendingConnector ? ' minucanvas-node--connector-source' : ''}${activeGroupId === node.id ? ' minucanvas-node--active-group' : ''}${node.groupId && activeGroupId !== node.groupId ? ' minucanvas-node--group-child-locked' : ''}${node.locked ? ' minucanvas-node--locked' : ''}`}
              data-minucanvas-node-id={node.id}
              style={nodeStyle(node)}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (readOnly) return
                if (node.type === 'group') {
                  setActiveGroupId(node.id)
                  emitSelection({ nodeIds: [], edgeIds: [] })
                  return
                }
                if (node.type === 'link' || node.type === 'image') {
                  const target = node.type === 'link' ? node.url : node.file ?? node.url
                  if (target) window.open(target, '_blank', 'noopener,noreferrer')
                  return
                }
                if (node.groupId && activeGroupId !== node.groupId) {
                  setActiveGroupId(node.groupId)
                  emitSelection({ nodeIds: [node.id], edgeIds: [] })
                  return
                }
                setEditingNodeId(node.id)
              }}
            >
              {polygonPath ? (
                <svg className="minucanvas-node__shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d={polygonPath} />
                </svg>
              ) : null}
              <div
                key={editing ? `${node.id}-editing` : `${node.id}-viewing`}
                className="minucanvas-node__content"
                contentEditable={editing && !readOnly}
                suppressContentEditableWarning
                ref={(element) => {
                  if (!element || !editing || readOnly) return
                  requestAnimationFrame(() => {
                    element.focus()
                    const range = document.createRange()
                    range.selectNodeContents(element)
                    const selectedRange = window.getSelection()
                    selectedRange?.removeAllRanges()
                    selectedRange?.addRange(range)
                  })
                }}
                onDoubleClick={(event) => {
                  if (node.type !== 'group' || readOnly) return
                  event.stopPropagation()
                  setEditingNodeId(node.id)
                }}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setEditingNodeId(null)
                    rootRef.current?.focus()
                    return
                  }
                  if (event.altKey && event.key === 'Enter') {
                    event.preventDefault()
                    insertEditableLineBreak(event.currentTarget)
                    handleNodeTextInput(node, event.currentTarget)
                    return
                  }
                  if (((event.metaKey || event.ctrlKey) && event.key === 'Enter') || (interactionMode === 'mindmap' && event.key === 'Enter' && !event.shiftKey)) {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
                onInput={(event) => handleNodeTextInput(node, event.currentTarget)}
                onBlur={(event) => handleNodeTextBlur(node, editableText(event.currentTarget))}
              >
                {editing ? <DefaultNodeContent node={node} editing={editing} /> : renderNode?.({ node, selected, editing }) ?? <DefaultNodeContent node={node} editing={editing} />}
              </div>
            </div>
          )
        })}

        <svg className="minucanvas-overlays" aria-hidden="true">
          {alignmentGuides.map((guide, index) => (
            guide.axis === 'x'
              ? <line key={`guide-${index}`} className="minucanvas-alignment-guide" x1={guide.value} y1={guide.from - 24 / viewport.zoom} x2={guide.value} y2={guide.to + 24 / viewport.zoom} />
              : <line key={`guide-${index}`} className="minucanvas-alignment-guide" x1={guide.from - 24 / viewport.zoom} y1={guide.value} x2={guide.to + 24 / viewport.zoom} y2={guide.value} />
          ))}
          {value.nodes.map((node) => {
            if (!selection.nodeIds.includes(node.id) || readOnly || node.locked) return null
            const showAddHandles = node.type !== 'group'
            const addHandleOffset = 28 / viewport.zoom
            const resizeHandleSize = 10 / viewport.zoom
            const resizeHandleRadius = 2 / viewport.zoom
            const allAddHandles: Array<{ direction: AddDirection; x: number; y: number; label: string; hintX: number; hintAnchor: 'start' | 'end' }> = [
              { direction: 'top', x: node.x + node.width / 2, y: node.y - addHandleOffset, label: '⌘↑', hintX: 16, hintAnchor: 'start' },
              { direction: 'right', x: node.x + node.width + addHandleOffset, y: node.y + node.height / 2, label: '⌘→', hintX: 16, hintAnchor: 'start' },
              { direction: 'bottom', x: node.x + node.width / 2, y: node.y + node.height + addHandleOffset, label: '⌘↓', hintX: 16, hintAnchor: 'start' },
              { direction: 'left', x: node.x - addHandleOffset, y: node.y + node.height / 2, label: '⌘←', hintX: -16, hintAnchor: 'end' },
            ]
            const addHandles = interactionMode === 'mindmap'
              ? allAddHandles.filter((handle) => handle.direction === 'left' || handle.direction === 'right')
              : allAddHandles
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
                {showAddHandles ? <g className="minucanvas-add-handles">
                  {addHandles.map((handle) => (
                    <g
                      key={handle.direction}
                      className={`minucanvas-add-handle minucanvas-add-handle--${handle.direction}`}
                      transform={`translate(${handle.x} ${handle.y}) scale(${1 / viewport.zoom})`}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        if (interactionMode === 'mindmap' && (handle.direction === 'left' || handle.direction === 'right')) {
                          emitSelection({ nodeIds: [node.id], edgeIds: [] })
                          createMindMapNode('child', handle.direction)
                          return
                        }
                        createConnectedNode(node, handle.direction)
                      }}
                    >
                      <circle r={11} />
                      <path className="minucanvas-add-handle__icon" d="M -5 0 H 5 M 0 -5 V 5" />
                      <text className="minucanvas-add-handle__hint" x={handle.hintX} y={4} textAnchor={handle.hintAnchor}>{handle.label}</text>
                    </g>
                  ))}
                </g> : null}
                <g className="minucanvas-resize-handles">
                {handles.map((handle) => (
                  <rect
                    key={handle.id}
                    className={`minucanvas-resize-handle minucanvas-resize-handle--${handle.id}`}
                    x={handle.x - resizeHandleSize / 2}
                    y={handle.y - resizeHandleSize / 2}
                    width={resizeHandleSize}
                    height={resizeHandleSize}
                    rx={resizeHandleRadius}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      emitSelection({ nodeIds: [node.id], edgeIds: [] })
                      undoTransactionRef.current = cloneCanvas(value)
                      undoTransactionPushedRef.current = false
                      dragRef.current = {
                        kind: 'resize-node',
                        nodeId: node.id,
                        handle: handle.id,
                        startPoint: pointFromEvent(event),
                        original: node,
                        childOriginals: node.type === 'group'
                          ? new Map(value.nodes.filter((child) => child.groupId === node.id).map((child) => [child.id, child]))
                          : new Map(),
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
            const fromSide = edge.fromSide ?? sideForPoint(fromNode, { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 })
            const toSide = edge.toSide ?? sideForPoint(toNode, { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 })
            const fromAnchor = edge.fromAnchor ?? defaultEdgeAnchorForSide(fromNode, fromSide)
            const toAnchor = edge.toAnchor ?? defaultEdgeAnchorForSide(toNode, toSide)
            const fromPoint = anchorForEdgeAnchor(fromNode, fromAnchor)
            const toPoint = anchorForEdgeAnchor(toNode, toAnchor)
            const routePoints = edgeRoutePoints(edge, fromNode, toNode)
            return (
              <g key={`${edge.id}-overlay-handles`} className="minucanvas-edge-handles">
                {routePoints.slice(0, -1).map((routePoint, index) => {
                  const nextPoint = routePoints[index + 1]
                  if (!nextPoint) return null
                  const length = Math.hypot(nextPoint.x - routePoint.x, nextPoint.y - routePoint.y)
                  if (length < 24) return null
                  const horizontal = Math.abs(nextPoint.x - routePoint.x) >= Math.abs(nextPoint.y - routePoint.y)
                  return (
                    <line
                      key={`segment-${index}`}
                      className={`minucanvas-edge-segment-handle minucanvas-edge-segment-handle--${horizontal ? 'horizontal' : 'vertical'}`}
                      x1={routePoint.x}
                      y1={routePoint.y}
                      x2={nextPoint.x}
                      y2={nextPoint.y}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        event.currentTarget.setPointerCapture(event.pointerId)
                        emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                        undoTransactionRef.current = cloneCanvas(value)
                        undoTransactionPushedRef.current = false
                        dragRef.current = { kind: 'edge-segment', edgeId: edge.id, segmentIndex: index, startPoint: pointFromEvent(event), originalPoints: routePoints.map((point) => ({ ...point })) }
                      }}
                    />
                  )
                })}
                <circle
                  className="minucanvas-edge-handle minucanvas-edge-handle--from"
                  cx={fromPoint.x}
                  cy={fromPoint.y}
                  r={8}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    emitSelection({ nodeIds: [], edgeIds: [edge.id] })
                    undoTransactionRef.current = cloneCanvas(value)
                    undoTransactionPushedRef.current = false
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
                    undoTransactionRef.current = cloneCanvas(value)
                    undoTransactionPushedRef.current = false
                    dragRef.current = { kind: 'edge-anchor', edgeId: edge.id, endpoint: 'to' }
                  }}
                />

              </g>
            )
          })}
        </svg>
      </div>
      <input
        ref={imageReplaceInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void replaceSelectedImage(file)
        }}
      />
      {shapeSwitcher && selectedShapeNodes.length > 0 ? (
        <div
          className="minucanvas-shape-switcher"
          style={{ left: shapeSwitcher.x, top: shapeSwitcher.y }}
          role="menu"
          aria-label="Change shape"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              setShapeSwitcher(null)
              rootRef.current?.focus()
              return
            }
            if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return
            event.preventDefault()
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            const currentIndex = Math.max(0, buttons.findIndex((button) => button === document.activeElement))
            const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
            buttons[(currentIndex + delta + buttons.length) % buttons.length]?.focus()
          }}
        >
          {SHAPE_SWITCHER_SHAPES.map((shape, index) => (
            <button
              key={shape}
              type="button"
              className={selectedShape === shape ? 'is-active' : ''}
              title={shapeLabel(shape)}
              aria-label={shapeLabel(shape)}
              aria-checked={selectedShape === shape}
              role="menuitemradio"
              autoFocus={selectedShape ? selectedShape === shape : index === 0}
              onClick={() => applyShapeToSelection(shape)}
            >
              <svg viewBox="0 0 28 28" aria-hidden="true"><CanvasShapeIcon shape={shape} /></svg>
              <span>{shapeLabel(shape)}</span>
            </button>
          ))}
        </div>
      ) : null}
      {exportDialogOpen ? (
        <div className="minucanvas-export-backdrop" role="presentation" onPointerDown={() => setExportDialogOpen(false)}>
          <div className="minucanvas-export-dialog" role="dialog" aria-modal="true" aria-label="Export" onPointerDown={(event) => event.stopPropagation()}>
            <h2>Export</h2>
            <label className="minucanvas-export-dialog__row">
              <span>Export Area</span>
              <span className="minucanvas-export-dialog__inline">
                <label><input type="radio" checked={exportOptions.area === 'canvas'} onChange={() => setExportOptions((options) => ({ ...options, area: 'canvas' }))} /> Canvas</label>
                <label><input type="radio" checked={exportOptions.area === 'selection'} disabled={selection.nodeIds.length === 0 && selection.edgeIds.length === 0} onChange={() => setExportOptions((options) => ({ ...options, area: 'selection' }))} /> Selection</label>
              </span>
            </label>
            <label className="minucanvas-export-dialog__row">
              <span>File Type</span>
              <select value={exportOptions.fileType} onChange={(event) => setExportOptions((options) => ({ ...options, fileType: event.target.value as ExportFileType }))}>
                <option value="png">Image</option>
                <option value="svg">SVG</option>
              </select>
            </label>
            {exportOptions.fileType === 'png' ? (
              <>
                <label className="minucanvas-export-dialog__row">
                  <span>Image Quality</span>
                  <select value={exportOptions.quality} onChange={(event) => setExportOptions((options) => ({ ...options, quality: Number(event.target.value) }))}>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={3}>3x</option>
                  </select>
                </label>
                <label className="minucanvas-export-dialog__row">
                  <span>Image Background</span>
                  <select value={exportOptions.background} onChange={(event) => setExportOptions((options) => ({ ...options, background: event.target.value as ExportBackground }))}>
                    <option value="solid">Solid</option>
                    <option value="transparent">Transparent</option>
                  </select>
                </label>
              </>
            ) : null}
            <label className="minucanvas-export-dialog__row">
              <span>Color Mode</span>
              <select value={exportOptions.colorMode} onChange={(event) => setExportOptions((options) => ({ ...options, colorMode: event.target.value as ExportColorMode }))}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <div className="minucanvas-export-dialog__actions">
              <button type="button" onClick={() => setExportDialogOpen(false)}>Cancel</button>
              <button type="button" className="minucanvas-export-dialog__primary" onClick={() => { void downloadExport(exportOptions); setExportDialogOpen(false) }}>Export</button>
            </div>
          </div>
        </div>
      ) : null}
      {activeGroup ? (
        <div className="minucanvas-group-breadcrumb">
          <span>Editing {activeGroup.label ?? activeGroup.text ?? 'Group'}</span>
          <button type="button" onClick={() => { setActiveGroupId(null); emitSelection({ nodeIds: [activeGroup.id], edgeIds: [] }) }}>Done</button>
        </div>
      ) : null}
      {contextMenu ? (
        <div
          ref={contextMenuRef}
          className="minucanvas-context-menu"
          data-submenu-side={rootRef.current && contextMenu.x > rootRef.current.clientWidth - 460 ? 'left' : 'right'}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => { copyCurrentSelection(); deleteCurrentSelection(); closeContextMenu() }} disabled={readOnly || (selection.nodeIds.length === 0 && selection.edgeIds.length === 0)}><span>Cut</span><kbd>⌘ X</kbd></button>
          <button type="button" onClick={() => { copyCurrentSelection(); closeContextMenu() }} disabled={selection.nodeIds.length === 0 && selection.edgeIds.length === 0}><span>Copy</span><kbd>⌘ C</kbd></button>
          <button type="button" onClick={() => { pasteClipboard(); closeContextMenu() }} disabled={readOnly}><span>Paste</span><kbd>⌘ V</kbd></button>
          <button type="button" onClick={() => { duplicateCurrentSelection(); closeContextMenu() }} disabled={readOnly || selection.nodeIds.length === 0}><span>Duplicate</span><kbd>⌘ D</kbd></button>
          <button type="button" onClick={() => { emitSelection({ nodeIds: value.nodes.map((node) => node.id), edgeIds: value.edges.map((edge) => edge.id) }); closeContextMenu() }}><span>Select all</span><kbd>⌘ A</kbd></button>
          <div className="minucanvas-context-menu__separator" />
          <button type="button" onClick={() => { setExportOptions((options) => ({ ...options, area: selection.nodeIds.length > 0 || selection.edgeIds.length > 0 ? 'selection' : 'canvas' })); setExportDialogOpen(true); closeContextMenu() }}><span>Export…</span></button>
          <div className="minucanvas-context-menu__separator" />
          <button type="button" onClick={() => { groupCurrentSelection(); closeContextMenu() }} disabled={readOnly || selection.nodeIds.length < 2}><span>Group selection</span><kbd>⌘ G</kbd></button>
          <button type="button" onClick={() => { ungroupCurrentSelection(); closeContextMenu() }} disabled={readOnly || selection.nodeIds.length === 0}><span>Ungroup</span><kbd>⇧⌘ G</kbd></button>
          <button type="button" onClick={() => { setSelectionLocked(true); closeContextMenu() }} disabled={readOnly || selection.nodeIds.length === 0}><span>Lock</span></button>
          <button type="button" onClick={() => { setSelectionLocked(false); closeContextMenu() }} disabled={readOnly || selection.nodeIds.length === 0}><span>Unlock</span></button>
          <button type="button" onClick={() => { openSelectedExternalNode(); closeContextMenu() }} disabled={!selectedImageNode && !selectedLinkNode}><span>{selectedImageNode ? 'Open image' : 'Open link'}</span></button>
          <button type="button" onClick={() => { imageReplaceInputRef.current?.click(); closeContextMenu() }} disabled={readOnly || !selectedImageNode}><span>Replace image…</span></button>
          <div className="minucanvas-context-menu__submenu">
            <button type="button" disabled={readOnly || !selection.nodeIds.some((id) => nodeById.get(id)?.type === 'image')}><span>Image size</span><kbd>›</kbd></button>
            <div className="minucanvas-context-menu minucanvas-context-menu__submenu-panel" role="menu">
              <button type="button" onClick={() => { resizeSelectedImages(0.25); closeContextMenu() }}><span>25%</span></button>
              <button type="button" onClick={() => { resizeSelectedImages(0.5); closeContextMenu() }}><span>50%</span></button>
              <button type="button" onClick={() => { resizeSelectedImages(1); closeContextMenu() }}><span>100%</span></button>
            </div>
          </div>
          <div className="minucanvas-context-menu__separator" />
          <div className="minucanvas-context-menu__submenu">
            <button type="button" disabled={readOnly || selection.nodeIds.length === 0}><span>Change order</span><kbd>›</kbd></button>
            <div className="minucanvas-context-menu minucanvas-context-menu__submenu-panel" role="menu">
              <button type="button" onClick={() => { bringCurrentSelectionToFront(); closeContextMenu() }}><span>Bring to front</span><kbd>⌘ ]</kbd></button>
              <button type="button" onClick={() => { bringCurrentSelectionForward(); closeContextMenu() }}><span>Bring forward</span></button>
              <button type="button" onClick={() => { sendCurrentSelectionBackward(); closeContextMenu() }}><span>Send backward</span></button>
              <button type="button" onClick={() => { sendCurrentSelectionToBack(); closeContextMenu() }}><span>Send to back</span><kbd>⌘ [</kbd></button>
            </div>
          </div>
          <div className="minucanvas-context-menu__submenu">
            <button type="button" disabled={readOnly || selection.nodeIds.length < 2}><span>Align</span><kbd>›</kbd></button>
            <div className="minucanvas-context-menu minucanvas-context-menu__submenu-panel" role="menu">
              <button type="button" onClick={() => { alignCurrentSelection('left'); closeContextMenu() }}><span>Left</span></button>
              <button type="button" onClick={() => { alignCurrentSelection('center'); closeContextMenu() }}><span>Center</span></button>
              <button type="button" onClick={() => { alignCurrentSelection('right'); closeContextMenu() }}><span>Right</span></button>
              <button type="button" onClick={() => { alignCurrentSelection('top'); closeContextMenu() }}><span>Top</span></button>
              <button type="button" onClick={() => { alignCurrentSelection('middle'); closeContextMenu() }}><span>Middle</span></button>
              <button type="button" onClick={() => { alignCurrentSelection('bottom'); closeContextMenu() }}><span>Bottom</span></button>
            </div>
          </div>
          <div className="minucanvas-context-menu__submenu">
            <button type="button" disabled={readOnly || selection.nodeIds.length < 3}><span>Distribute</span><kbd>›</kbd></button>
            <div className="minucanvas-context-menu minucanvas-context-menu__submenu-panel" role="menu">
              <button type="button" onClick={() => { distributeCurrentSelection('horizontal'); closeContextMenu() }}><span>Horizontal</span></button>
              <button type="button" onClick={() => { distributeCurrentSelection('vertical'); closeContextMenu() }}><span>Vertical</span></button>
            </div>
          </div>
          <div className="minucanvas-context-menu__separator" />
          <button type="button" className="minucanvas-context-menu__danger" onClick={() => { deleteCurrentSelection(); closeContextMenu() }} disabled={readOnly || (selection.nodeIds.length === 0 && selection.edgeIds.length === 0)}><span>Delete</span><kbd>⌫</kbd></button>
        </div>
      ) : null}
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
