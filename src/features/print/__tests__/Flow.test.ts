import { splitFlow } from '../Flow'

const heading = { weight: 1.6, keep: true, start: true }
const row: { weight: number; keep?: boolean } = { weight: 1 }

describe('splitFlow', () => {
  it('leaves a short list in one column', () => {
    expect(splitFlow([heading, row, row])).toBeNull()
  })

  it('cuts between groups when that balances well', () => {
    const items = [heading, row, row, row, row, heading, row, row, row, row]
    expect(splitFlow(items)).toBe(5)
  })

  it('never leaves a heading at the end of the first column', () => {
    const items = [heading, row, row, row, row, row, row, heading, row, row]
    const cut = splitFlow(items)
    expect(cut).not.toBeNull()
    expect(items[cut! - 1].keep).toBeUndefined()
  })

  it('splits inside a long group when the groups are lopsided', () => {
    const items = [heading, ...Array(12).fill(row), heading, row]
    const cut = splitFlow(items)!
    expect(cut).toBeGreaterThan(1)
    expect(cut).toBeLessThan(13)
  })
})
