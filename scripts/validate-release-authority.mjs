import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import YAML from 'yaml'

const workflowDirectory = '.github/workflows'
const releaseWorkflow = 'release-update.yml'
const mutationPattern = /\bgh\s+release\s+(?:create|delete|edit|upload)\b|actions\/create-release@|softprops\/action-gh-release@|ncipollo\/release-action@|\btagName\s*:/i

export async function validateReleaseAuthority(directory = workflowDirectory) {
  const files = (await readdir(directory)).filter((name) => /\.ya?ml$/i.test(name)).sort()
  const findings = []
  let releaseWriters = 0
  let releaseMutators = 0

  for (const file of files) {
    const source = await readFile(join(directory, file), 'utf8')
    const workflow = YAML.parse(source)
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const serialized = textValues(job).join('\n')
      const writesContents = job?.permissions?.contents === 'write'
      const mutatesRelease = mutationPattern.test(serialized)
      if (file === releaseWorkflow && jobName === 'publish') {
        releaseWriters += Number(writesContents)
        releaseMutators += Number(mutatesRelease)
        continue
      }
      if (writesContents) findings.push(`${file}:${jobName} grants contents: write outside the release publisher`)
      if (mutatesRelease) findings.push(`${file}:${jobName} can mutate a GitHub Release outside the release publisher`)
    }
  }

  if (releaseWriters !== 1) findings.push(`Expected exactly one release publisher with contents: write, found ${releaseWriters}`)
  if (releaseMutators !== 1) findings.push(`Expected exactly one GitHub Release mutator, found ${releaseMutators}`)
  if (findings.length) throw new Error(`Release authority validation failed:\n- ${findings.join('\n- ')}`)
  return { workflow: releaseWorkflow, job: 'publish' }
}

function textValues(value) {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textValues)
  if (value && typeof value === 'object') return Object.values(value).flatMap(textValues)
  return []
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const authority = await validateReleaseAuthority()
  process.stdout.write(`Release authority is limited to ${authority.workflow}:${authority.job}.\n`)
}
