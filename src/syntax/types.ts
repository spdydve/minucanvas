import type { CanvasEdgeStyle, CanvasNodeStyle, CanvasShape, JsonCanvasDocument } from '../types'

export type MinuDiagramDirection = 'down' | 'up' | 'right' | 'left'
export type MinuDiagramDiagnosticSeverity = 'warning' | 'error'

export interface MinuDiagramDiagnostic {
  severity: MinuDiagramDiagnosticSeverity
  message: string
  line?: number | undefined
}

export interface MinuDiagramNode {
  id: string
  label?: string | undefined
  type?: 'text' | 'file' | 'link' | 'group' | 'image' | undefined
  shape?: string | undefined
  url?: string | undefined
  file?: string | undefined
  width?: number | undefined
  height?: number | undefined
  color?: string | undefined
  style?: CanvasNodeStyle | undefined
  groupId?: string | undefined
  line?: number | undefined
}

export interface MinuDiagramGroup {
  id: string
  label?: string | undefined
  color?: string | undefined
  style?: CanvasNodeStyle | undefined
  parentGroupId?: string | undefined
  line?: number | undefined
}

export type MinuDiagramConnectionOperator = '>' | '<' | '<>' | '-' | '--' | '-->'

export interface MinuDiagramConnection {
  from: string
  to: string
  operator: MinuDiagramConnectionOperator
  label?: string | undefined
  color?: string | undefined
  style?: CanvasEdgeStyle | undefined
  line?: number | undefined
}

export interface ParsedMinuDiagram {
  title?: string | undefined
  direction: MinuDiagramDirection
  nodes: MinuDiagramNode[]
  groups: MinuDiagramGroup[]
  connections: MinuDiagramConnection[]
  defaults: {
    colorMode?: string | undefined
    styleMode?: string | undefined
    typeface?: string | undefined
  }
  diagnostics: MinuDiagramDiagnostic[]
}

export interface MinuDiagramCompileOptions {
  origin?: { x: number; y: number }
  nodeGap?: number
  rankGap?: number
  groupPadding?: number
  /** Snap generated node centers to this grid size. Set to false to disable. */
  gridSize?: number | false
}

export interface MinuDiagramCompileResult {
  document: JsonCanvasDocument
  parsed: ParsedMinuDiagram
  diagnostics: MinuDiagramDiagnostic[]
}

export type SupportedMinuDiagramShape = CanvasShape
