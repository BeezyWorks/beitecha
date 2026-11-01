/** Moving prompts and answers between Beitecha and a chat AI: the clipboard, or a file when it's blocked. */

export function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function pickTextFile(onText: (text: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.csv,.tsv,.txt,.md,application/json,text/csv,text/plain'
  input.onchange = () => input.files?.[0]?.text().then(onText)
  input.click()
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
