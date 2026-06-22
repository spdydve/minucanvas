import { StrictMode, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasStyleToolbar, CanvasToolbar, MinuCanvas, compileMinuDiagramSyntax } from '../src/index'
import type { CanvasHandle, CanvasTool, JsonCanvasDocument } from '../src/index'
import '../src/theme/theme.css'
import './fullscreen.css'

const MIND_MAP_SYNTAX = `diagram "Product plan" {
  layout mindmap

  Product [shape: pill]

  Product > Research
  Product > Build
  Product > Launch
  Product > Docs

  Research > Interviews
  Research > Competitors
  Research > Trends

  Build > Prototype
  Build > MVP
  Build > Beta

  Launch > Website
  Launch > Announcement
  Launch > Feedback
}`

function createMindMapDocument(): JsonCanvasDocument {
  return compileMinuDiagramSyntax(MIND_MAP_SYNTAX, {
    layout: 'mindmap',
    mindMap: {
      rootId: 'Product',
      horizontalGap: 140,
      verticalGap: 32,
    },
  }).document
}

function MindMapFullscreenExample() {
  const canvasRef = useRef<CanvasHandle>(null)
  const initialDocument = useMemo(() => createMindMapDocument(), [])
  const [document, setDocument] = useState<JsonCanvasDocument>(initialDocument)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selected, setSelected] = useState({ nodeIds: [] as string[], edgeIds: [] as string[] })

  async function handleDemoUpload(file: File) {
    return URL.createObjectURL(file)
  }

  function resetMindMap() {
    setDocument(createMindMapDocument())
    setSelected({ nodeIds: [], edgeIds: [] })
    requestAnimationFrame(() => canvasRef.current?.fitView())
  }

  return (
    <div className="fullscreen-shell">
      <header className="fullscreen-topbar">
        <div className="fullscreen-title">
          <h1>MinuCanvas mind map</h1>
          <span>Generated from `layout mindmap`; try curved branches, keyboard navigation, and shape editing.</span>
        </div>
        <nav className="fullscreen-tools" aria-label="Canvas actions">
          <button onClick={() => canvasRef.current?.fitView()}>Fit</button>
          <button onClick={() => canvasRef.current?.resetView()}>Reset view</button>
          <button onClick={resetMindMap}>Reset mind map</button>
          <a href="/fullscreen.html">Flow fullscreen</a>
          <a href="/">Standard demo</a>
        </nav>
      </header>
      <main className="fullscreen-canvas">
        <CanvasToolbar tool={tool} onToolChange={setTool} className="fullscreen-canvas__toolbar" orientation="vertical" />
        <CanvasStyleToolbar
          value={document}
          selection={selected}
          onChange={(next) => setDocument(next)}
          className="fullscreen-canvas__style-toolbar"
        />
        <MinuCanvas
          ref={canvasRef}
          value={document}
          onChange={(next) => setDocument(next)}
          tool={tool}
          onToolChange={setTool}
          selectedNodeIds={selected.nodeIds}
          selectedEdgeIds={selected.edgeIds}
          onSelectionChange={setSelected}
          onUpload={handleDemoUpload}
          onExternalContentWarning={(warning) => console.warn(warning.message, warning)}
          canvasTheme="dark"
          shapeTheme="outline"
          grid
          snapToGrid
          autoFit
          autoFocus
        />
      </main>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <MindMapFullscreenExample />
  </StrictMode>,
)
