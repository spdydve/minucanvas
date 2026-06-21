import { describe, expect, it } from 'vitest'
import { compileMinuDiagramSyntax, parseMinuDiagramSyntax } from './index'

describe('parseMinuDiagramSyntax', () => {
  it('parses nodes, direction, labels, chains, and edge properties', () => {
    const parsed = parseMinuDiagramSyntax(`
      diagram "Auth flow" {
        direction right
        User [shape: pill]
        Valid [shape: diamond, label: "Valid?"]
        User > Login > Valid
        Valid > Done: yes [style: dashed, color: green]
      }
    `)

    expect(parsed.title).toBe('Auth flow')
    expect(parsed.direction).toBe('right')
    expect(parsed.nodes.map((node) => node.id)).toContain('Login')
    expect(parsed.nodes.find((node) => node.id === 'Valid')?.label).toBe('Valid?')
    expect(parsed.connections).toHaveLength(3)
    expect(parsed.connections[2]).toMatchObject({ from: 'Valid', to: 'Done', label: 'yes', color: 'green' })
  })

  it('parses layout directives', () => {
    const parsed = parseMinuDiagramSyntax(`
      diagram "Plan" {
        layout mindmap
        Root > A
      }
    `)

    expect(parsed.layout).toBe('mindmap')
  })

  it('parses groups and assigns child group IDs', () => {
    const parsed = parseMinuDiagramSyntax(`
      Backend [label: "Backend services"] {
        API
        DB
      }
    `)

    expect(parsed.groups[0]).toMatchObject({ id: 'Backend', label: 'Backend services' })
    expect(parsed.nodes.find((node) => node.id === 'API')?.groupId).toBe('Backend')
  })
})

describe('compileMinuDiagramSyntax', () => {
  it('compiles flow syntax to MinuCanvas JSON', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      Start [shape: pill]
      Valid [shape: diamond, label: "Valid?"]
      Start > Valid: check
    `)

    expect(result.document.nodes).toHaveLength(2)
    expect(result.document.nodes.find((node) => node.id === 'Valid')?.shape).toBe('diamond')
    expect(result.document.edges[0]).toMatchObject({ fromNode: 'Start', toNode: 'Valid', label: 'check', toEnd: 'arrow' })
    expect(result.document.edges[0].toAnchor).toMatchObject({ side: 'left', position: 0 })
    expect(result.document.nodes.find((node) => node.id === 'Valid')?.x).toBeGreaterThan(
      result.document.nodes.find((node) => node.id === 'Start')?.x ?? 0,
    )
  })

  it('compiles explicit edge routing', () => {
    const result = compileMinuDiagramSyntax('A > B [routing: straight]')

    expect(result.document.edges[0].style?.routing).toBe('straight')
  })

  it('supports lineType as an edge routing alias', () => {
    const result = compileMinuDiagramSyntax('A > B [lineType: curved]')

    expect(result.document.edges[0].style?.routing).toBe('curved')
  })

  it('warns on unsupported edge routing', () => {
    const result = compileMinuDiagramSyntax('A > B [routing: diagonal]')

    expect(result.document.edges[0].style?.routing).toBeUndefined()
    expect(result.diagnostics[0]).toMatchObject({ severity: 'warning' })
  })

  it('warns and falls back for unsupported shapes', () => {
    const result = compileMinuDiagramSyntax('DB [shape: cylinder]')

    expect(result.document.nodes[0].shape).toBe('rounded-rectangle')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })

  it('uses node positions to choose sides for back edges', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      A > B > C
      C > A
    `)

    const backEdge = result.document.edges.find((edge) => edge.fromNode === 'C' && edge.toNode === 'A')
    expect(backEdge).toMatchObject({ fromSide: 'bottom', toSide: 'bottom', style: { routing: 'elbow' } })
  })

  it('center-aligns mixed-height nodes on the main horizontal lane', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      User [shape: pill]
      Login [shape: rectangle]
      Valid [shape: diamond]
      User > Login > Valid
    `)

    const centers = result.document.nodes.map((node) => node.y + node.height / 2)
    expect(new Set(centers).size).toBe(1)
  })

  it('compiles mind map layout with curved branch edges', () => {
    const result = compileMinuDiagramSyntax(`
      layout mindmap
      Root [shape: pill]
      Root > Research
      Root > Build
      Research > Interviews
      Research > Competitors
    `)

    const root = result.document.nodes.find((node) => node.id === 'Root')
    const research = result.document.nodes.find((node) => node.id === 'Research')
    const build = result.document.nodes.find((node) => node.id === 'Build')
    const interviews = result.document.nodes.find((node) => node.id === 'Interviews')
    expect(root).toBeTruthy()
    expect(research).toBeTruthy()
    expect(build).toBeTruthy()
    expect(interviews).toBeTruthy()
    expect(research!.x).toBeGreaterThan(root!.x)
    expect(build!.x).toBeLessThan(root!.x)
    expect(interviews!.x).toBeGreaterThan(research!.x)
    expect(result.document.edges.every((edge) => edge.toEnd === 'none' && edge.style?.routing === 'curved')).toBe(true)
  })

  it('routes downward diamond branches into the top of the target', () => {
    const result = compileMinuDiagramSyntax(`
      direction right
      Valid [shape: diamond]
      Dashboard [shape: pill]
      Error [shape: text]
      Valid > Dashboard: yes
      Valid > Error: no
    `)

    const edge = result.document.edges.find((item) => item.toNode === 'Error')
    expect(edge).toMatchObject({ fromSide: 'bottom', toSide: 'top' })
  })
})
