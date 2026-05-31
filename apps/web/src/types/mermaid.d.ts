declare module 'mermaid' {
  interface MermaidApi {
    initialize(config: Record<string, unknown>): void
    render(id: string, code: string): Promise<{ svg: string }>
  }

  const mermaid: MermaidApi
  export default mermaid
}
