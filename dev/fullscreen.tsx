import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MinuCanvas } from '../src/index'
import type { CanvasHandle, CanvasTool, JsonCanvasDocument } from '../src/index'
import '../src/theme/theme.css'
import './fullscreen.css'

const FULLSCREEN_INITIAL: JsonCanvasDocument = {
  nodes: [
    {
      id: 'source',
      type: 'text',
      text: 'Plan',
      x: -340,
      y: -60,
      width: 220,
      height: 110,
      shape: 'rounded-rectangle',
    },
    {
      id: 'one',
      type: 'text',
      x: 40,
      y: -220,
      width: 240,
      height: 110,
      shape: 'rounded-rectangle',
    },
    {
      id: 'two',
      type: 'text',
      x: 40,
      y: -60,
      width: 240,
      height: 110,
      shape: 'rounded-rectangle',
    },
    {
      id: 'three',
      type: 'text',
      x: 40,
      y: 100,
      width: 240,
      height: 110,
      shape: 'rounded-rectangle',
    },
  ],
  edges: [
    {
      id: 'source-one',
      fromNode: 'source',
      toNode: 'one',
      fromAnchor: { side: 'right', position: 0.32 },
      toAnchor: { side: 'left', position: 0.5 },
      toEnd: 'arrow',
      style: { routing: 'elbow' },
    },
    {
      id: 'source-two',
      fromNode: 'source',
      toNode: 'two',
      fromAnchor: { side: 'right', position: 0.5 },
      toAnchor: { side: 'left', position: 0.5 },
      toEnd: 'arrow',
      style: { routing: 'elbow' },
    },
    {
      id: 'source-three',
      fromNode: 'source',
      toNode: 'three',
      fromAnchor: { side: 'right', position: 0.68 },
      toAnchor: { side: 'left', position: 0.5 },
      toEnd: 'arrow',
      style: { routing: 'elbow' },
    },
  ],
}

function FullscreenExample() {
  const canvasRef = useRef<CanvasHandle>(null)
  const [document, setDocument] = useState<JsonCanvasDocument>(FULLSCREEN_INITIAL)
  const [tool, setTool] = useState<CanvasTool>('select')

  const tools: CanvasTool[] = ['select', 'hand', 'arrow', 'line', 'text', 'rectangle', 'diamond', 'ellipse', 'pill']

  return (
    <div className="fullscreen-shell">
      <header className="fullscreen-topbar">
        <div className="fullscreen-title">
          <h1>MinuCanvas fullscreen</h1>
          <span>Try arrows, line endpoints, resizing, + handles, and Cmd/Ctrl+Arrow.</span>
        </div>
        <nav className="fullscreen-tools" aria-label="Canvas tools">
          {tools.map((item) => (
            <button key={item} className={tool === item ? 'active' : ''} onClick={() => setTool(item)}>
              {item}
            </button>
          ))}
          <button onClick={() => canvasRef.current?.fitView()}>Fit</button>
          <button onClick={() => canvasRef.current?.resetView()}>Reset</button>
          <a href="/">Standard demo</a>
        </nav>
      </header>
      <main className="fullscreen-canvas">
        <MinuCanvas
          ref={canvasRef}
          value={document}
          onChange={(next) => setDocument(next)}
          tool={tool}
          onToolChange={setTool}
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
    <FullscreenExample />
  </StrictMode>,
)
