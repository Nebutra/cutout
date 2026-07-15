export interface NewTaskState{readonly view:'home'|'project';readonly resetSignal:number;readonly lastRequestId?:string}
export interface NewTaskTransition{readonly state:NewTaskState;readonly saveActiveProject:boolean;readonly resetWorkspace:boolean;readonly focusComposer:boolean;readonly createProject:false;readonly applied:boolean}
export function planNewTask(state:NewTaskState,requestId:string):NewTaskTransition{if(!requestId.trim()||state.lastRequestId===requestId)return{state,saveActiveProject:false,resetWorkspace:false,focusComposer:false,createProject:false,applied:false};return{state:{view:'home',resetSignal:state.resetSignal+1,lastRequestId:requestId},saveActiveProject:state.view==='project',resetWorkspace:true,focusComposer:true,createProject:false,applied:true}}
export interface NewTaskGate{run(action:()=>Promise<void>|void):Promise<boolean>}
export function createNewTaskGate():NewTaskGate{let active=false;return{async run(action){if(active)return false;active=true;try{await action();return true}finally{queueMicrotask(()=>{active=false})}}}}

export interface NewTaskIntentContext {
  readonly view: 'home' | 'project'
  readonly blankProject: boolean
  readonly hasHomeDraft: boolean
  readonly resetSignal: number
  readonly lastRequestId?: string
}

export function projectNewTaskIntent(context: NewTaskIntentContext, requestId: string) {
  const transition = planNewTask({ view: context.view, resetSignal: context.resetSignal, lastRequestId: context.lastRequestId }, requestId)
  return {
    ...transition,
    saveActiveProject: transition.applied && context.view === 'project' && !context.blankProject,
    closeActiveProject: transition.applied && context.view === 'project',
    clearComposer: transition.applied,
    clearAttachments: transition.applied,
    clearPreset: transition.applied,
    discardPolicy: context.view === 'home' && context.hasHomeDraft ? 'explicit-user-reset' as const : context.view === 'project' && !context.blankProject ? 'persist-before-reset' as const : 'no-content-loss' as const,
  }
}
