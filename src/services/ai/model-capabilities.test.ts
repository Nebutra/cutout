import { describe, expect, it } from 'vitest'
import {
  capabilityBindingsSchema,
  descriptorSupports,
  modelCatalogSourceSchema,
  modelDescriptorSchema,
  modelTaskProfile,
  projectPrimaryAssignments,
} from './model-capabilities'

describe('model capability domain', () => {
  it('models atomic and composite task requirements without inventing a webdev model capability', () => {
    expect(modelTaskProfile('webdev')).toMatchObject({required:['text','tools'],composite:true})
    expect(modelTaskProfile('image-to-webdev')).toMatchObject({required:['text','vision','tools'],composite:true})
    const descriptor=modelDescriptorSchema.parse({providerId:'p',model:'m',capabilities:['text','tools'],source:'provider'})
    expect(descriptorSupports(descriptor,modelTaskProfile('webdev'))).toBe(true)
    expect(descriptorSupports(descriptor,modelTaskProfile('image-to-webdev'))).toBe(false)
  })

  it('accepts only current catalog evidence sources', () => {
    expect(modelCatalogSourceSchema.options).toEqual([
      'provider',
      'remote-catalog',
      'verified-catalog',
      'user-declared',
    ])
  })

  it('rejects extra persisted fields and derives primary UI slots from bindings', () => {
    const chat={providerId:'p',model:'chat'}
    const image={providerId:'p',model:'image'}
    const bindings=capabilityBindingsSchema.parse({
      version:'model-assignments.v2',
      bindings:{text:chat,'image-generation':image},
    })
    expect(projectPrimaryAssignments(bindings)).toEqual({chat,image})
    expect(capabilityBindingsSchema.safeParse({...bindings,oldSlots:{chat}}).success).toBe(false)
    expect(capabilityBindingsSchema.safeParse({
      version:'model-assignments.v2',
      bindings:{text:{...chat,oldOption:true}},
    }).success).toBe(false)
  })
})
