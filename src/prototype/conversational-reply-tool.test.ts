import { describe, expect, it } from 'vitest'
import { conversationalReplyTool } from './conversational-reply-tool'

describe('conversationalReplyTool', () => {
  it('is a pure passthrough — execute returns exactly what it validated', async () => {
    const tool = conversationalReplyTool()
    const input = tool.inputSchema.parse({ reply: 'Hey! What would you like to design today?' })
    await expect(tool.execute(input)).resolves.toEqual(input)
  })

  it('rejects an empty reply', () => {
    const tool = conversationalReplyTool()
    const result = tool.inputSchema.safeParse({ reply: '' })
    expect(result.success).toBe(false)
  })

  it('is marked read-only', () => {
    expect(conversationalReplyTool().isReadOnly).toBe(true)
  })

  it('asks for a concise user-facing reply instead of workflow narration', () => {
    const description = conversationalReplyTool().inputSchema.shape.reply.description ?? ''
    expect(description).toMatch(/one or two short sentences/i)
    expect(description).toMatch(/Never explain internal routing/i)
  })
})
