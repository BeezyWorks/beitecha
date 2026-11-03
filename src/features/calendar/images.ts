/* eslint-disable no-restricted-syntax -- white behind transparent pictures: the paper, not a theme color */
import type { BackImage } from './pictures'

// 4200 px is a 12-megapixel phone photo untouched, and still 380 dpi across
// a letter sheet: past that it only makes the page slow. Pictures are never
// enlarged, and smaller ones are kept as they are.
const PRINT_SIDE = 4200
const PREVIEW_SIDE = 800

const newId = () => `pic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const draw = (bitmap: ImageBitmap, side: number, quality: number) => {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas')
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

const shrink = async (file: File): Promise<BackImage> => {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, PRINT_SIDE / Math.max(bitmap.width, bitmap.height))
  const image = {
    url: draw(bitmap, PRINT_SIDE, 0.92),
    preview: draw(bitmap, PREVIEW_SIDE, 0.8),
    aspect: bitmap.width / bitmap.height,
    width: Math.round(bitmap.width * scale),
    height: Math.round(bitmap.height * scale),
  }
  bitmap.close()
  return { id: newId(), name: file.name, ...image }
}

/** The small copy for the preview, made from a print-size picture that was
 * kept (the preview is not saved, to keep a draft light). */
export const previewFor = async (url: string): Promise<string> => {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob())
  try {
    return draw(bitmap, PREVIEW_SIDE, 0.8)
  } finally {
    bitmap.close()
  }
}

/** Lets the page paint (a progress count) between pictures. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve))

/** Reads picture files (chosen, or dropped onto the preview) into memory, shrunk to what a sheet needs, one at a time
 * so the page can show how far along it is. Ones the browser can't read are skipped. */
export const readBackImages = async (
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<BackImage[]> => {
  const loaded: BackImage[] = []
  onProgress?.(0, files.length)
  for (const [i, file] of files.entries()) {
    await breathe()
    try {
      loaded.push(await shrink(file))
    } catch {
      // Skipped: the browser couldn't read it.
    }
    onProgress?.(i + 1, files.length)
  }
  return loaded
}

/** Asks for pictures and reads them. */
export const pickBackImages = (
  onProgress?: (done: number, total: number) => void,
): Promise<BackImage[]> =>
  new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = () => resolve(readBackImages(Array.from(input.files ?? []), onProgress))
    // Closing the chooser without a choice fires `cancel`.
    input.oncancel = () => resolve([])
    input.click()
  })
