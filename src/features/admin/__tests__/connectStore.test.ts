import { ApiError, api, type ChangeView } from '@/lib/api'
import { pendingCountOf, useConnect } from '../connectStore'
import { useAdmin } from '../store'

jest.mock('@/lib/api', () => {
  class ApiError extends Error {
    status: number
    body?: unknown
    constructor(status: number, message: string, body?: unknown) {
      super(message)
      this.status = status
      this.body = body
    }
  }
  return {
    ApiError,
    api: {
      connections: jest.fn(),
      changes: jest.fn(),
      setApi: jest.fn(),
      approveChange: jest.fn(),
      rejectChange: jest.fn(),
      undoChange: jest.fn(),
      undoSince: jest.fn(),
      revokeConnection: jest.fn(),
      revokeAll: jest.fn(),
      createConnection: jest.fn(),
      patchConnection: jest.fn(),
      admin: jest.fn(),
    },
  }
})

const mocked = api as unknown as Record<string, jest.Mock>
const change = (id: string, over: Partial<ChangeView> = {}): ChangeView => ({
  id,
  connectionId: 'c1',
  connectionLabel: 'Claude',
  connectionKind: 'key',
  userId: 'u',
  userName: 'Rivka',
  op: 'notice.create',
  target: null,
  payload: null,
  before: [],
  after: [],
  status: 'pending',
  createdAt: Date.now(),
  expiresAt: Date.now() + 1e9,
  decidedBy: null,
  decidedByName: null,
  decidedAt: null,
  ...over,
})

beforeEach(() => {
  jest.resetAllMocks()
  mocked.connections.mockResolvedValue({ enabled: true, defaultMode: 'review', connections: [] })
  mocked.changes.mockResolvedValue([change('a'), change('b')])
  useConnect.setState({
    slug: 'shul',
    ready: true,
    changes: [change('a'), change('b')],
    refused: {},
  })
  useAdmin.setState({
    slug: 'shul',
    dirty: false,
    save: 'idle',
    editing: null,
    schedule: null,
  })
})

describe('pending count', () => {
  it('counts pending ones that have not run out', () => {
    expect(
      pendingCountOf([
        change('a'),
        change('b', { status: 'applied' }),
        change('c', { expiresAt: Date.now() - 1 }),
      ]),
    ).toBe(1)
  })
})

describe('approve', () => {
  it('reloads the schedule into the admin after it applies', async () => {
    mocked.approveChange.mockResolvedValue({})
    mocked.admin.mockResolvedValue({
      revision: 5,
      profile: { name: { en: 'S' } },
      schedule: { events: [] },
    })
    expect(await useConnect.getState().approve('a')).toBe(true)
    expect(mocked.admin).toHaveBeenCalledWith('shul')
    expect(useAdmin.getState().loaded?.revision).toBe(5)
    expect(useAdmin.getState().save).toBe('idle')
  })

  it('shows "It no longer fits" and leaves it pending on a 409', async () => {
    mocked.approveChange.mockRejectedValue(new ApiError(409, 'it no longer fits: no such event'))
    expect(await useConnect.getState().approve('a')).toBe(false)
    expect(useConnect.getState().refused.a).toBe('It no longer fits: no such event')
    expect(mocked.admin).not.toHaveBeenCalled()
  })

  it('does not drop unsaved edits: the usual conflict choice shows instead', async () => {
    mocked.approveChange.mockResolvedValue({})
    useAdmin.setState({ dirty: true })
    await useConnect.getState().approve('a')
    expect(mocked.admin).not.toHaveBeenCalled()
    expect(useAdmin.getState().save).toBe('conflict')
    expect(useAdmin.getState().dirty).toBe(true)
  })

  it('approve all goes through every pending one and says how many fit', async () => {
    mocked.approveChange
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError(409, 'it no longer fits: gone'))
    mocked.admin.mockResolvedValue({ revision: 2, profile: {}, schedule: { events: [] } })
    await useConnect.getState().approveAll()
    expect(mocked.approveChange).toHaveBeenCalledTimes(2)
    expect(useConnect.getState().notice).toMatch(/Approved 1 of 2/)
  })
})

describe('undo', () => {
  it('keeps the reason when the target changed since', async () => {
    mocked.undoChange.mockRejectedValue(new ApiError(409, "can't undo: it was edited"))
    expect(await useConnect.getState().undo('a')).toBe(false)
    expect(useConnect.getState().refused.a).toBe("Can't undo: it was edited")
  })

  it('reloads the schedule after undo-since, and reports where it stopped', async () => {
    mocked.undoSince.mockResolvedValue({
      undone: ['x', 'y'],
      remaining: 1,
      conflict: { changeId: 'z', message: "can't undo: edited" },
    })
    mocked.admin.mockResolvedValue({ revision: 9, profile: {}, schedule: { events: [] } })
    await useConnect.getState().undoSince('c1', 0)
    expect(useConnect.getState().notice).toBe("Undid 2. Stopped: Can't undo: edited")
    expect(mocked.admin).toHaveBeenCalled()
  })
})

describe('turning the API off', () => {
  it('reloads the connections, which come back revoked', async () => {
    mocked.setApi.mockResolvedValue({ enabled: false, defaultMode: 'review', revoked: 2 })
    mocked.connections.mockResolvedValue({ enabled: false, defaultMode: 'review', connections: [] })
    await useConnect.getState().setEnabled(false)
    expect(mocked.setApi).toHaveBeenCalledWith('shul', { enabled: false })
    expect(useConnect.getState().enabled).toBe(false)
  })
})

describe('admin.reloadFromServer', () => {
  it('leaves an open, changed event alone and raises the conflict', async () => {
    useAdmin.setState({ editing: { event: {} as never, isNew: false, changed: true } })
    await useAdmin.getState().reloadFromServer()
    expect(mocked.admin).not.toHaveBeenCalled()
    expect(useAdmin.getState().save).toBe('conflict')
  })
})
