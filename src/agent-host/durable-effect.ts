import type{createTauriAgentHostService}from'./tauri-service'
type Host=ReturnType<typeof createTauriAgentHostService>
export async function runDurableHostEffect<T>(input:{host:Host;runId:string;nodeId:string;effectKey:string;execute:()=>Promise<{value:T;receiptId:string}>;heartbeatMs?:number}){
 const heartbeatMs=input.heartbeatMs??10_000
 await input.host.runStart(input.runId,[{id:input.nodeId,effectKey:input.effectKey}]);await input.host.nodeClaim(input.runId,input.nodeId,heartbeatMs*3,3)
 const timer=setInterval(()=>void input.host.nodeHeartbeat(input.runId,input.nodeId,heartbeatMs*3),heartbeatMs)
 try{const result=await input.execute();await input.host.nodeComplete(input.runId,input.nodeId,result.receiptId);return result.value}
 catch(error){await input.host.nodeFail(input.runId,input.nodeId,error instanceof Error?error.message:String(error));throw error}
 finally{clearInterval(timer)}
}
