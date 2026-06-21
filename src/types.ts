import type { CSSProperties, ReactNode } from 'react'

export type JsonCanvasSide = 'top' | 'right' | 'bottom' | 'left'
export type JsonCanvasEdgeEnd = 'none' | 'arrow'
export type JsonCanvasNodeType = 'text' | 'file' | 'link' | 'group' | 'image'

/**
 * The base JSON Canvas document shape. Extra properties are allowed by design so
 * host services can persist app-specific metadata alongside spec-compatible data.
 */
export interface JsonCanvasDocument<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  nodes: Array<CanvasNode<NodeExtra>>
  edges: Array<CanvasEdge<EdgeExtra>>
}

export type CanvasShape =
  | 'text'
  | 'rectangle'
  | 'rounded-rectangle'
  | 'pill'
  | 'diamond'
  | 'ellipse'
  | 'parallelogram'
  | 'hexagon'

export type CanvasTool =
  | 'select'
  | 'hand'
  | 'arrow'
  | 'line'
  | 'text'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'pill'

export type CanvasEdgeRouting = 'straight' | 'curved' | 'elbow'
export type CanvasStrokeStyle = 'solid' | 'dashed' | 'dotted' | 'sketch'
export type CanvasThemeMode = 'light' | 'dark' | 'system'
export type CanvasShapeTheme = 'outline' | 'filled' | 'soft'
export type CanvasAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type CanvasDistribution = 'horizontal' | 'vertical'

export interface CanvasNodeStyle {
  fill?: string
  stroke?: string
  text?: string
  strokeWidth?: number
  strokeStyle?: CanvasStrokeStyle
  borderRadius?: number
  opacity?: number
  fontFamily?: string
  fontSize?: number
  fontWeight?: CSSProperties['fontWeight']
  textAlign?: CSSProperties['textAlign']
}

export interface CanvasEdgeStyle {
  stroke?: string
  strokeWidth?: number
  strokeStyle?: CanvasStrokeStyle
  routing?: CanvasEdgeRouting
  opacity?: number
}

export interface CanvasEdgeAnchor {
  side: JsonCanvasSide
  /** 0..1 position along the chosen side. 0.5 is the side midpoint. */
  position: number
}

export type CanvasNode<NodeExtra extends Record<string, unknown> = Record<string, unknown>> = NodeExtra & {
  id: string
  type: JsonCanvasNodeType
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
  background?: string
  shape?: CanvasShape
  style?: CanvasNodeStyle
  groupId?: string
  locked?: boolean
  imageWidth?: number
  imageHeight?: number
  imageStatus?: 'uploading' | 'failed'
  imageError?: string
}

export type CanvasEdge<EdgeExtra extends Record<string, unknown> = Record<string, unknown>> = EdgeExtra & {
  id: string
  fromNode: string
  fromSide?: JsonCanvasSide
  fromAnchor?: CanvasEdgeAnchor
  fromEnd?: JsonCanvasEdgeEnd
  toNode: string
  toSide?: JsonCanvasSide
  toAnchor?: CanvasEdgeAnchor
  toEnd?: JsonCanvasEdgeEnd
  label?: string
  color?: string
  style?: CanvasEdgeStyle
}

export interface CanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface CanvasSelection {
  nodeIds: string[]
  edgeIds: string[]
}

export interface CanvasChangeContext {
  reason:
    | 'create-node'
    | 'update-node'
    | 'update-edge'
    | 'move-node'
    | 'delete'
    | 'create-edge'
    | 'duplicate'
    | 'paste'
    | 'programmatic'
}

export interface CanvasShortcut {
  key: string
  description: string
  tool?: CanvasTool
}

export interface CanvasRenderNodeContext<NodeExtra extends Record<string, unknown> = Record<string, unknown>> {
  node: CanvasNode<NodeExtra>
  selected: boolean
  editing: boolean
}

export interface CanvasRenderEdgeContext<EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  edge: CanvasEdge<EdgeExtra>
  selected: boolean
}

export interface CanvasHandle<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  getDocument: () => JsonCanvasDocument<NodeExtra, EdgeExtra>
  getSelection: () => CanvasSelection
  selectAll: () => void
  clearSelection: () => void
  deleteSelection: () => void
  setTool: (tool: CanvasTool) => void
  createNode: (partial: Partial<CanvasNode<NodeExtra>>) => CanvasNode<NodeExtra>
  createEdge: (fromNode: string, toNode: string, partial?: Partial<CanvasEdge<EdgeExtra>>) => CanvasEdge<EdgeExtra> | null
  groupSelection: () => CanvasNode<NodeExtra> | null
  ungroupSelection: () => void
  bringSelectionForward: () => void
  sendSelectionBackward: () => void
  bringSelectionToFront: () => void
  sendSelectionToBack: () => void
  alignSelection: (alignment: CanvasAlignment) => void
  distributeSelection: (distribution: CanvasDistribution) => void
  exportSvg: () => string
  exportPng: () => Promise<string>
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  fitView: () => void
}

export interface CanvasExternalContentWarning {
  code: 'missing-upload-handler' | 'inline-image-fallback' | 'unsupported-file'
  message: string
  file?: File
}

export interface MinuCanvasProps<NodeExtra extends Record<string, unknown> = Record<string, unknown>, EdgeExtra extends Record<string, unknown> = Record<string, unknown>> {
  value: JsonCanvasDocument<NodeExtra, EdgeExtra>
  onChange: (nextValue: JsonCanvasDocument<NodeExtra, EdgeExtra>, context: CanvasChangeContext) => void
  readOnly?: boolean
  className?: string
  autoFocus?: boolean
  minHeight?: number | string
  maxHeight?: number | string
  /** Canvas/surface theme. `theme` is kept as an alias for editor-package style usage. */
  canvasTheme?: CanvasThemeMode
  theme?: CanvasThemeMode
  /** Shape rendering theme, independent from the canvas surface theme. */
  shapeTheme?: CanvasShapeTheme
  tool?: CanvasTool
  defaultTool?: CanvasTool
  selectedNodeIds?: string[]
  selectedEdgeIds?: string[]
  onSelectionChange?: (selection: CanvasSelection) => void
  onToolChange?: (tool: CanvasTool) => void
  initialViewport?: CanvasViewport
  /** Fit the current document into the visible canvas once after mount. */
  autoFit?: boolean
  onViewportChange?: (viewport: CanvasViewport) => void
  renderNode?: (context: CanvasRenderNodeContext<NodeExtra>) => ReactNode
  renderEdgeLabel?: (context: CanvasRenderEdgeContext<EdgeExtra>) => ReactNode
  getNodeDefaults?: (tool: CanvasTool, point: { x: number; y: number }) => Partial<CanvasNode<NodeExtra>>
  onUpload?: (file: File) => Promise<string>
  onResolveLink?: (url: string) => Promise<{ label?: string } | null>
  allowInlineImages?: boolean
  onExternalContentWarning?: (warning: CanvasExternalContentWarning) => void
  grid?: boolean
  snapToGrid?: boolean
  gridSize?: number
  shortcuts?: boolean
}
