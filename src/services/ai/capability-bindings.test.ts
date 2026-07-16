import { describe, expect, it } from 'vitest'
import { capabilityBindingsSchema, mergeLegacyRouteBindings, migrateLegacyAssignments, projectLegacyAssignments } from './model-capabilities'

const chat={providerId:'openai.1',model:'gpt-5.5'},image={providerId:'openai.1',model:'gpt-image-2'}

describe('capability bindings migration',()=>{
  it('migrates legacy runtime slots and projects them back without a second source of truth',()=>{
    const bindings=migrateLegacyAssignments({chat,image})
    expect(bindings.bindings).toEqual({text:chat,'image-generation':image})
    expect(projectLegacyAssignments(bindings)).toEqual({chat,image})
  })

  it('merges every legacy ModelSlot dimension into the v2 task table',()=>{
    const bindings=mergeLegacyRouteBindings(migrateLegacyAssignments({chat,image}),{
      asr:{providerId:'speech.1',model:'whisper-1'},
      tts:{providerId:'speech.1',model:'tts-1'},
      webdev:{providerId:'anthropic.1',model:'claude-code',fallback:'claude-fast'},
      'image-to-webdev':{providerId:'google.1',model:'gemini-vision'},
    })
    expect(capabilityBindingsSchema.parse(bindings).bindings).toMatchObject({asr:{model:'whisper-1'},tts:{model:'tts-1'},webdev:{model:'claude-code',fallbackModel:'claude-fast'},'image-to-webdev':{model:'gemini-vision'}})
  })
})
