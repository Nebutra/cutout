const integrations=['github','notion','figma','obsidian','pencil','paper','framer','canva']
const forbidden=Object.keys(process.env).filter((key)=>/^(?:GITHUB_TOKEN|NOTION_TOKEN|FIGMA_TOKEN|CANVA_TOKEN|FRAMER_TOKEN|API_KEY)$/i.test(key))
if(forbidden.length){process.stderr.write(`Refusing credential environment variables: ${forbidden.join(', ')}\n`);process.exit(2)}
process.stdout.write(`${JSON.stringify({protocol:'cutout.integration-smoke.v1',status:'capability-required',results:integrations.map((integrationId)=>({integrationId,status:'capability-required',evidence:[],message:'Inject an authorized production host and opaque SecretHandle to run provider readback.'}))},null,2)}\n`)
