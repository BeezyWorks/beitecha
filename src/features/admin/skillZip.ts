import { SKILL_FILES } from '../../../skill/files.generated'
import { makeZip } from './zip'

export interface SkillOptions {
  key: string
  slug: string
  shulName: string
  apiBase: string
}

const FOLDER = 'beitecha'

/** The zip's files: the real skill files plus a config.json carrying this shul's key. */
export function skillEntries({ key, slug, shulName, apiBase }: SkillOptions) {
  const enc = new TextEncoder()
  const config = JSON.stringify({ apiBase, slug, key, shulName }, null, 2) + '\n'
  return [
    ...Object.entries(SKILL_FILES).map(([name, text]) => ({
      name: `${FOLDER}/${name}`,
      data: enc.encode(text),
    })),
    { name: `${FOLDER}/config.json`, data: enc.encode(config) },
  ]
}

export const skillZipBytes = (opts: SkillOptions, now?: Date) => makeZip(skillEntries(opts), now)

/** Builds `beitecha-skill.zip` in the browser and downloads it. */
export async function downloadSkill(opts: SkillOptions): Promise<void> {
  const bytes = skillZipBytes(opts)
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'beitecha-skill.zip'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
