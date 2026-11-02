/** Choosing a logo: an image file scaled down and kept as a data URL in the schedule, so the sheet needs no hosting. */

/** The longest side kept, in px: sharp at the sheet's logo size, small enough to store with the schedule. */
const MAX_SIDE = 256

/** The schedule is capped at 512 KB in all, so a logo may take only a part of it. */
const MAX_CHARS = 150_000

export function pickLogo(onLogo: (dataUrl: string) => void, onError: (message: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onerror = () => onError('Couldn’t read that file.')
    reader.onload = () => {
      const source = String(reader.result)
      // A vector logo stays as it is.
      const done = (url: string) =>
        url.length > MAX_CHARS ? onError('That logo is too big; try a smaller one.') : onLogo(url)
      if (file.type === 'image/svg+xml') return done(source)
      const img = new Image()
      img.onerror = () => onError('That doesn’t look like an image.')
      img.onload = () => {
        const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * k))
        canvas.height = Math.max(1, Math.round(img.height * k))
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
        // Photos stay JPEG; anything that may be transparent stays PNG.
        done(
          file.type === 'image/jpeg'
            ? canvas.toDataURL('image/jpeg', 0.9)
            : canvas.toDataURL('image/png'),
        )
      }
      img.src = source
    }
    reader.readAsDataURL(file)
  }
  input.click()
}
