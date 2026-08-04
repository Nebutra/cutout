import { describe, expect, it } from 'vitest'
import { capabilityBindingsSchema, projectPrimaryAssignments } from './model-capabilities'

const chat={providerId:'openai.1',model:'gpt-5.5'}
const image={providerId:'openai.1',model:'gpt-image-2'}

describe('capability bindings',()=>{
  it('round-trips current task bindings and derives the primary two-slot view',()=>{
    const bindings=capabilityBindingsSchema.parse({
      version:'model-assignments.v2',
      bindings:{
        text:chat,
        vision:chat,
        'image-generation':image,
        'image-edit':image,
      },
    })
    expect(capabilityBindingsSchema.parse(bindings)).toEqual(bindings)
    expect(projectPrimaryAssignments(bindings)).toEqual({chat,image})
  })

  it('fails closed for unknown dimensions and malformed assignments',()=>{
    expect(capabilityBindingsSchema.safeParse({
      version:'model-assignments.v2',
      bindings:{unknown:{providerId:'p',model:'m'}},
    }).success).toBe(false)
    expect(capabilityBindingsSchema.safeParse({
      version:'model-assignments.v2',
      bindings:{text:{providerId:'p'}},
    }).success).toBe(false)
  })
})
