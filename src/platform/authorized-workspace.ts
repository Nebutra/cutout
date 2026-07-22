export interface AuthorizedWorkspace { readonly handle:string; readonly label?:string }
let current:AuthorizedWorkspace|undefined
const listeners=new Set<(value:AuthorizedWorkspace|undefined)=>void>()
export function getAuthorizedWorkspace(){return current}
export function setAuthorizedWorkspace(value:AuthorizedWorkspace|undefined){if(value&&!/^[A-Za-z0-9._:-]{3,256}$/.test(value.handle))throw new Error('Authorized workspace handle is invalid.');current=value;for(const listener of listeners)listener(value)}
export function subscribeAuthorizedWorkspace(listener:(value:AuthorizedWorkspace|undefined)=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function clearAuthorizedWorkspaceForProjectTransition(currentProjectId:string|null,nextProjectId:string|null){if(currentProjectId!==nextProjectId)setAuthorizedWorkspace(undefined)}
