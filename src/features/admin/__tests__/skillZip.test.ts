import { SKILL_FILES } from '../../../../skill/files.generated'
import { skillZipBytes } from '../skillZip'
import { crc32, makeZip } from '../zip'

// The app's tsconfig has no node types; this test reads files with node's own modules.
declare const require: (id: string) => any
declare const __dirname: string
const { readFileSync } = require('fs') as { readFileSync: (p: string, enc: string) => string }
const { join } = require('path') as { join: (...p: string[]) => string }

const dec = new TextDecoder()

/** Reads a STORE zip back through its central directory. */
function parse(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.length - 22
  expect(v.getUint32(eocd, true)).toBe(0x06054b50)
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out: Record<string, string> = {}
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 24, true)
    const nameLen = v.getUint16(p + 28, true)
    const lho = v.getUint32(p + 42, true)
    const name = dec.decode(zip.subarray(p + 46, p + 46 + nameLen))
    expect(v.getUint32(lho, true)).toBe(0x04034b50)
    expect(v.getUint16(lho + 8, true)).toBe(0)
    expect(v.getUint32(lho + 14, true)).toBe(crc)
    const start = lho + 30 + v.getUint16(lho + 26, true)
    const data = zip.subarray(start, start + size)
    expect(crc32(data)).toBe(crc)
    out[name] = dec.decode(data)
    p += 46 + nameLen
  }
  return out
}

describe('zip writer', () => {
  it('crc32 matches the known check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('round-trips files, including Hebrew names and text', () => {
    const e = (name: string, s: string) => ({ name, data: new TextEncoder().encode(s) })
    const files = parse(
      makeZip([e('a/x.txt', 'hello'), e('a/שלום.txt', 'שלום עולם'), e('a/empty', '')]),
    )
    expect(files).toEqual({ 'a/x.txt': 'hello', 'a/שלום.txt': 'שלום עולם', 'a/empty': '' })
  })
})

describe('skill zip', () => {
  const dir = join(__dirname, '../../../../skill')

  it('generated files match skill/ (run `pnpm skill:gen` if this fails)', () => {
    expect(Object.keys(SKILL_FILES).sort()).toEqual(['README.md', 'SKILL.md', 'beitecha.py'])
    for (const [name, text] of Object.entries(SKILL_FILES)) {
      expect(text).toBe(readFileSync(join(dir, name), 'utf8'))
    }
  })

  it('contains a beitecha/ folder with the files and the shul config', () => {
    const files = parse(
      skillZipBytes({
        key: 'bk_sec_x',
        slug: 'demo',
        shulName: 'בית',
        apiBase: 'https://b.example',
      }),
    )
    expect(Object.keys(files).sort()).toEqual([
      'beitecha/README.md',
      'beitecha/SKILL.md',
      'beitecha/beitecha.py',
      'beitecha/config.json',
    ])
    expect(JSON.parse(files['beitecha/config.json'])).toEqual({
      apiBase: 'https://b.example',
      slug: 'demo',
      key: 'bk_sec_x',
      shulName: 'בית',
    })
    expect(files['beitecha/beitecha.py']).toBe(readFileSync(join(dir, 'beitecha.py'), 'utf8'))
  })
})
