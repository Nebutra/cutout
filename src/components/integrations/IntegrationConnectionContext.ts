import { createContext, useContext } from 'react'
import { OAuthConnectionController } from '@/integration-sdk'

const IntegrationConnectionContext = createContext(new OAuthConnectionController())

export function useIntegrationConnections() {
  return useContext(IntegrationConnectionContext)
}
