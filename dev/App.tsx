import { useMemo, useRef, useState } from 'react'
import { MinuCanvas } from '../src/index'
import { defaultCanvasShortcuts } from '../src/index'
import type { CanvasHandle, CanvasShapeTheme, CanvasThemeMode, CanvasTool, JsonCanvasDocument } from '../src/index'
import '../src/theme/theme.css'
import lightThemeUrl from '../src/theme/themes/light.css?url'
import darkThemeUrl from '../src/theme/themes/dark.css?url'

type ThemeChoice = 'base' | 'light' | 'dark'

const THEME_URLS: Record<Exclude<ThemeChoice, 'base'>, string> = {
  light: lightThemeUrl,
  dark: darkThemeUrl,
}

const INITIAL_CANVAS: JsonCanvasDocument = {
  nodes: [
    {
      id: 'start',
      type: 'text',
      text: 'Start',
      x: -120,
      y: -40,
      width: 160,
      height: 80,
      shape: 'pill',
    },
    {
      id: 'decision',
      type: 'text',
      text: 'Approved?',
      x: 170,
      y: -70,
      width: 140,
      height: 140,
      shape: 'diamond',
    },
    {
      id: 'ship',
      type: 'text',
      text: 'Ship it',
      x: 440,
      y: -40,
      width: 170,
      height: 80,
      shape: 'rounded-rectangle',
    },
    {
      id: 'revise',
      type: 'text',
      text: 'Revise draft',
      x: 160,
      y: 170,
      width: 180,
      height: 90,
      shape: 'ellipse',
    },
  ],
  edges: [
    {
      id: 'start-decision',
      fromNode: 'start',
      fromSide: 'right',
      toNode: 'decision',
      toSide: 'left',
      toEnd: 'arrow',
      style: { routing: 'curved', strokeStyle: 'sketch' },
    },
    {
      id: 'decision-ship',
      fromNode: 'decision',
      fromSide: 'right',
      toNode: 'ship',
      toSide: 'left',
      toEnd: 'arrow',
      label: 'yes',
      style: { routing: 'elbow' },
    },
    {
      id: 'decision-revise',
      fromNode: 'decision',
      fromSide: 'bottom',
      toNode: 'revise',
      toSide: 'top',
      toEnd: 'arrow',
      label: 'no',
      style: { routing: 'curved', strokeStyle: 'dashed' },
    },
  ],
}

function themeMode(choice: ThemeChoice): CanvasThemeMode {
  if (choice === 'dark') return 'dark'
  if (choice === 'light') return 'light'
  return 'system'
}

export default function App() {
  const canvasRef = useRef<CanvasHandle>(null)
  const [document, setDocument] = useState<JsonCanvasDocument>(INITIAL_CANVAS)
  const [theme, setTheme] = useState<ThemeChoice>('base')
  const [shapeTheme, setShapeTheme] = useState<CanvasShapeTheme>('outline')
  const [grid, setGrid] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selected, setSelected] = useState({ nodeIds: [] as string[], edgeIds: [] as string[] })

  const activeThemeUrl = theme === 'base' ? null : THEME_URLS[theme]
  const serialized = useMemo(() => JSON.stringify(document, null, 2), [document])

  return (
    <div className={`app app--theme-${theme}`}>
      {activeThemeUrl ? <link rel="stylesheet" href={activeThemeUrl} /> : null}
      <header className="app-header">
        <div>
          <h1>@dpklabs/minucanvas</h1>
          <p>JSON Canvas foundation, flowchart MVP shapes, Excalidraw/Eraser-inspired lines.</p>
        </div>
        <div className="header-controls">
          <label>
            Canvas
            <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeChoice)}>
              <option value="base">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Shapes
            <select value={shapeTheme} onChange={(event) => setShapeTheme(event.target.value as CanvasShapeTheme)}>
              <option value="outline">Outline</option>
              <option value="filled">Filled</option>
              <option value="soft">Soft</option>
            </select>
          </label>
          <label className="checkbox-control">
            <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
            Grid
          </label>
          <label className="checkbox-control">
            <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            Snap
          </label>
          <button onClick={() => canvasRef.current?.fitView()}>Fit</button>
          <button onClick={() => canvasRef.current?.resetView()}>Reset</button>
          <a href="/fullscreen.html">Fullscreen</a>
        </div>
      </header>

      <main className="app-main">
        <section className="toolbar" aria-label="Canvas tools">
          {(['select', 'hand', 'arrow', 'line', 'text', 'rectangle', 'diamond', 'ellipse', 'pill'] as CanvasTool[]).map((item) => (
            <button key={item} className={tool === item ? 'active' : ''} onClick={() => setTool(item)}>
              {item}
            </button>
          ))}
        </section>

        <section className="canvas-frame">
          <MinuCanvas
            ref={canvasRef}
            value={document}
            onChange={(next) => setDocument(next)}
            tool={tool}
            onToolChange={setTool}
            selectedNodeIds={selected.nodeIds}
            selectedEdgeIds={selected.edgeIds}
            onSelectionChange={setSelected}
            canvasTheme={themeMode(theme)}
            shapeTheme={shapeTheme}
            grid={grid}
            snapToGrid={snapToGrid}
            autoFit
            autoFocus
            getNodeDefaults={() => ({})}
          />
        </section>

        <section className="info-grid">
          <article>
            <h2>Shortcuts</h2>
            <ul>
              {defaultCanvasShortcuts.map((shortcut) => (
                <li key={shortcut.key}>
                  <kbd>{shortcut.key}</kbd>
                  <span>{shortcut.description}</span>
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h2>JSON Canvas output</h2>
            <pre>{serialized}</pre>
          </article>
        </section>
      </main>
    </div>
  )
}
