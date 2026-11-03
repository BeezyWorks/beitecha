import { buildDraftFile, parseCalendarSettings, parseDraftFile } from '../draftFile'
import { type BackImage, defaultPictureSettings } from '../pictures'

const image: BackImage = {
  id: 'a',
  name: 'Shul.jpg',
  aspect: 1.5,
  width: 3000,
  height: 2000,
  url: 'data:image/jpeg;base64,AAAA',
  preview: 'data:image/jpeg;base64,BB',
}

describe('calendar draft files', () => {
  const pictures = {
    ...defaultPictureSettings,
    imageIds: ['a'],
    matches: { '2026-11-01': 'a', '2027-01-01': 'gone' },
    frames: { a: { zoom: 2, cx: 0.4, cy: 0.5, rot: 90 } },
    coverId: 'a',
    backCoverId: 'gone',
    front: true,
  }
  const calendar = {
    basis: 'hebrew' as const,
    clockChange: true,
    hiddenPeople: ['y1'],
    footer: 'Hello',
    monthFooters: { '2026-11-01': 'Nov' },
  }

  it('round-trips the choices and pictures, without the previews', () => {
    const file = JSON.stringify(
      buildDraftFile(calendar, pictures, [image], { from: '2026-11-01', to: '2027-10-01' }),
    )
    expect(file).not.toContain('BB')
    const got = parseDraftFile(file)!
    expect(got.calendar).toMatchObject(calendar)
    expect(got.range).toEqual({ from: '2026-11-01', to: '2027-10-01' })
    expect(got.images).toEqual([
      { id: 'a', name: 'Shul.jpg', aspect: 1.5, width: 3000, height: 2000, url: image.url },
    ])
    expect(got.pictures.frames.a.rot).toBe(90)
  })
  it('drops what points at a picture the file does not carry', () => {
    const got = parseDraftFile(JSON.stringify(buildDraftFile(calendar, pictures, [image])))!
    expect(got.pictures.matches).toEqual({ '2026-11-01': 'a' })
    expect(got.pictures.backCoverId).toBeUndefined()
    expect(got.pictures.coverId).toBe('a')
  })
  it('refuses other files, and pictures that are not images', () => {
    expect(parseDraftFile('not json')).toBeUndefined()
    expect(parseDraftFile('{"kind":"other","version":1}')).toBeUndefined()
    const bad = buildDraftFile({}, defaultPictureSettings, [
      { ...image, url: 'https://x.test/a.png' },
    ])
    expect(parseDraftFile(JSON.stringify(bad))!.images).toEqual([])
  })
  it('keeps only well-formed choices', () => {
    expect(
      parseCalendarSettings({
        basis: 'x',
        paper: 'a3',
        hiddenGroups: ['fast', 'nope'],
        parsha: 'yes',
        events: [1, 'e'],
      }),
    ).toMatchObject({
      paper: 'a3',
      hiddenGroups: ['fast'],
      events: ['e'],
    })
    expect(parseCalendarSettings(null)).toEqual({})
  })
})
