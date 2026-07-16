import { invoke } from '@tauri-apps/api/core'
import type { DesignDocument } from '@/design-ir'

export interface WorkspaceRevision { readonly document:DesignDocument;readonly sha256:string;readonly revisionId:string;readonly revisionNumber:number }
export interface WorkspaceExportPlan { readonly id:string;readonly expectedSha256:string;readonly currentSha256:string;readonly nextSha256:string;readonly conflict:boolean;readonly requiresApproval:true }
type Invoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>

export function createProjectWorkspaceBridge(call:Invoke=invoke){
  return {
    read:(workspaceHandle:string)=>call<WorkspaceRevision>('workspace_revision_read',{workspaceHandle}),
    previewExport:(workspaceHandle:string,expectedSha256:string,document:DesignDocument)=>call<WorkspaceExportPlan>('workspace_revision_preview_export',{workspaceHandle,expectedSha256,document}),
    applyExport:(planId:string,approvalId:string)=>{
      if(!approvalId.trim())throw new Error('Explicit approval id is required.')
      return call<WorkspaceRevision>('workspace_revision_apply_export',{planId,approvalId})
    },
  }
}

export class ProjectWorkspaceBinding {
  #baseline?:WorkspaceRevision
  readonly projectId:string
  readonly workspaceHandle:string
  readonly bridge:ReturnType<typeof createProjectWorkspaceBridge>
  constructor(projectId:string,workspaceHandle:string,bridge:ReturnType<typeof createProjectWorkspaceBridge>){this.projectId=projectId;this.workspaceHandle=workspaceHandle;this.bridge=bridge}
  baseline(){return this.#baseline}
  async bind(){this.#baseline=await this.bridge.read(this.workspaceHandle);return this.#baseline}
  async detectExternalChange(){const current=await this.bridge.read(this.workspaceHandle);return{changed:Boolean(this.#baseline&&current.sha256!==this.#baseline.sha256),current,baseline:this.#baseline}}
  async previewExport(document:DesignDocument){if(!this.#baseline)throw new Error('Import the authoritative workspace revision before export.');return this.bridge.previewExport(this.workspaceHandle,this.#baseline.sha256,document)}
  async applyExport(plan:WorkspaceExportPlan,approvalId:string){if(plan.conflict)throw new Error('External Design IR changed; resolve the conflict before export.');const revision=await this.bridge.applyExport(plan.id,approvalId);this.#baseline=revision;return revision}
}
