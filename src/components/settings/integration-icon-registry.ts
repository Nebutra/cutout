import canva from '@/assets/integration-brands/canva.svg?raw'
import paper from '@/assets/integration-brands/paper.png'
import pencil from '@/assets/integration-brands/pencil.png'
import figma from 'simple-icons/icons/figma.svg?raw'
import framer from 'simple-icons/icons/framer.svg?raw'
import github from 'simple-icons/icons/github.svg?raw'
import notion from 'simple-icons/icons/notion.svg?raw'
import obsidian from 'simple-icons/icons/obsidian.svg?raw'

interface IntegrationIconProvenance {
  readonly source: string
  readonly sourceUrl: string
  readonly license: string
}

interface MonochromeSvgIcon extends IntegrationIconProvenance {
  readonly kind: 'monochrome-svg'
  readonly svg: string
}

interface ColorSvgIcon extends IntegrationIconProvenance {
  readonly kind: 'color-svg'
  readonly svg: string
}

interface ImageIcon extends IntegrationIconProvenance {
  readonly kind: 'image'
  readonly src: string
}

export type IntegrationIconAsset =
  | MonochromeSvgIcon
  | ColorSvgIcon
  | ImageIcon

const simpleIcon = (svg: string, slug: string): MonochromeSvgIcon => ({
  kind: 'monochrome-svg',
  svg,
  source: 'Simple Icons',
  sourceUrl: `https://simpleicons.org/?q=${slug}`,
  license: 'CC0-1.0',
})

export const integrationIconRegistry = {
  'cutout.figma': simpleIcon(figma, 'figma'),
  'cutout.github': simpleIcon(github, 'github'),
  'cutout.notion': simpleIcon(notion, 'notion'),
  'cutout.obsidian': simpleIcon(obsidian, 'obsidian'),
  'cutout.framer': simpleIcon(framer, 'framer'),
  'cutout.canva': {
    kind: 'color-svg',
    svg: canva,
    source: 'Canva Developers',
    sourceUrl: 'https://www.canva.dev/',
    license: 'Canva trademark and brand terms',
  },
  'cutout.pencil': {
    kind: 'image',
    src: pencil,
    source: 'pen.dev',
    sourceUrl: 'https://pen.dev/apple-touch-icon.png',
    license: 'Pencil trademark and brand terms',
  },
  'cutout.paper': {
    kind: 'image',
    src: paper,
    source: 'paper.design',
    sourceUrl: 'https://paper.design/logos/app-icons/Paper%20App%20Icon%20512.png',
    license: 'Paper trademark and brand terms',
  },
} satisfies Record<string, IntegrationIconAsset>
