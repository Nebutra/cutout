import { z } from 'zod'
import type { IntegrationAuthMode, IntegrationSession, IntegrationSurface, SecretHandle } from './contracts'

const safe=z.string().min(1).max(200).refine((v)=>!/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}|bearer\s+|api[-_]?key|token\s*[:=]|secret\s*[:=])/i.test(v),'Credential-shaped values are forbidden.')
export const secretHandleSchema=z.object({kind:z.literal('secret-handle'),id:safe,provider:safe,sessionId:safe}).strict()
export const hostSessionSchema=z.object({id:safe,integrationId:safe,surface:z.enum(['desktop','cli','mcp','headless','webhook']),authMode:z.enum(['none','api-key','oauth2','host-session']),secretHandle:secretHandleSchema.optional(),scopes:z.array(safe).max(100),createdAt:z.string().datetime(),expiresAt:z.string().datetime().optional(),revokedAt:z.string().datetime().optional()}).strict().superRefine((value,ctx)=>{if(value.authMode!=='none'&&!value.secretHandle)ctx.addIssue({code:'custom',message:'Authorized sessions require a host-owned SecretHandle.'});if(value.secretHandle&&value.secretHandle.sessionId!==value.id)ctx.addIssue({code:'custom',message:'SecretHandle must be bound to its session.'})})
export type HostSession=z.infer<typeof hostSessionSchema>
export interface DesktopSessionHost{
  authorize(input:{readonly integrationId:string;readonly provider:string;readonly authMode:Exclude<IntegrationAuthMode,'none'>;readonly scopes:readonly string[];readonly surface:IntegrationSurface;readonly signal:AbortSignal}):Promise<HostSession>
  revoke(sessionId:string):Promise<void>
}
export class IntegrationSessionBroker{
  #sessions=new Map<string,HostSession>()
  readonly host:DesktopSessionHost
  readonly now:()=>string
  constructor(host:DesktopSessionHost,now:()=>string=()=>new Date().toISOString()){this.host=host;this.now=now}
  async connect(input:{readonly integrationId:string;readonly provider:string;readonly authMode:Exclude<IntegrationAuthMode,'none'>;readonly scopes:readonly string[];readonly surface:IntegrationSurface;readonly signal?:AbortSignal}){const session=hostSessionSchema.parse(await this.host.authorize({...input,signal:input.signal??new AbortController().signal}));if(session.integrationId!==input.integrationId||session.surface!==input.surface||session.authMode!==input.authMode||session.secretHandle?.provider!==input.provider)throw new Error('Desktop host returned a session for another integration boundary.');this.#sessions.set(session.id,session);return publicSession(session)}
  resolve(sessionId:string,integrationId:string,surface:IntegrationSurface):IntegrationSession{const session=this.#sessions.get(sessionId);if(!session||session.integrationId!==integrationId||session.surface!==surface)throw new Error('Integration session is unavailable for this boundary.');if(session.revokedAt)throw new Error('Integration session was revoked.');if(session.expiresAt&&session.expiresAt<=this.now())throw new Error('Integration session expired.');return publicSession(session)}
  async disconnect(sessionId:string){const session=this.#sessions.get(sessionId);if(!session)return;await this.host.revoke(sessionId);this.#sessions.set(sessionId,{...session,revokedAt:this.now()})}
}
function publicSession(session:HostSession):IntegrationSession{return{id:session.id,integrationId:session.integrationId,surface:session.surface,authMode:session.authMode,...(session.secretHandle?{secretHandle:session.secretHandle as SecretHandle}:{}),createdAt:session.createdAt,...(session.expiresAt?{expiresAt:session.expiresAt}:{})}}
