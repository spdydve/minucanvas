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
    expect(result.document.nodes.find((node) => node.id === 'Valid')?.x).toBeGreaterThan(
      result.document.nodes.find((node) => node.id === 'Start')?.x ?? 0,
    )
  })

  it('warns and falls back for unsupported shapes', () => {
    const result = compileMinuDiagramSyntax('DB [shape: cylinder]')

    expect(result.document.nodes[0].shape).toBe('rounded-rectangle')
    expect(result.diagnostics[0]?.severity).toBe('warning')
  })
})
