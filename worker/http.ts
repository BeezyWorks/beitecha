export const json = (body: unknown, init: ResponseInit = {}) => Response.json(body, init)

export const fail = (status: number, error: string, extra?: Record<string, unknown>) =>
  Response.json({ error, ...extra }, { status })

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  const text = await request.text()
  if (text.length > maxBytes) throw new HttpError(413, 'body too large')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}
