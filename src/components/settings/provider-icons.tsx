import type { ComponentProps } from 'react'
import { Boxes, Cloud, Network, Server } from 'lucide-react'
import type { ProviderDefinition } from '@/services/ai/provider-registry'
import { providerOfficialIconAssets, providerSimpleIconAssets } from './provider-icon-assets'

export function ProviderIcon({definition,className='size-5'}:{readonly definition:ProviderDefinition;readonly className?:string}){
  const reference=definition.icon
  const official=reference?providerOfficialIconAssets[reference.id]:undefined
  if(official)return <span role="img" aria-label={`${definition.label} logo`} data-provider-icon={definition.id} data-provider-icon-source={reference?.id} className={`inline-block text-current [&>svg]:size-full [&>svg]:fill-current ${className}`} dangerouslySetInnerHTML={{__html:official.replace('<svg','<svg aria-hidden="true" focusable="false"')}}/>
  if(reference?.id.startsWith('simple-icons:')){
    const icon=providerSimpleIconAssets[reference.id.slice('simple-icons:'.length) as keyof typeof providerSimpleIconAssets]
    if(icon)return <span role="img" aria-label={`${definition.label} logo`} data-provider-icon={definition.id} data-provider-icon-source={reference.id} className={`inline-block text-current [&>svg]:size-full [&>svg]:fill-current ${className}`} dangerouslySetInnerHTML={{__html:icon.replace('<svg','<svg aria-hidden="true" focusable="false"')}}/>
  }
  const Generic=reference?.id==='cutout:local'?Server:reference?.id==='cutout:gateway'?Network:reference?.id==='cutout:compatible'?Boxes:Cloud
  return <Generic role="img" aria-label={`${definition.label} provider`} data-provider-icon={definition.id} data-provider-icon-source={reference?.id??'cutout:provider'} className={className} strokeWidth={1.8}/>
}

export type ProviderIconProps=ComponentProps<typeof ProviderIcon>
