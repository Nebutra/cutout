import { describe, expect, it } from 'vitest'
import { shouldShowProjectMenu } from './project-menu-visibility'

describe('project menu visibility', () => {
  it('shows project lifecycle actions only inside an open project', () => {
    expect(shouldShowProjectMenu('project')).toBe(true)
    expect(shouldShowProjectMenu('home')).toBe(false)
  })
})
