import { Button } from '@beezyworks/design'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'

import { Centered } from '@/components/Centered'
import { Page } from '@/components/Page'
import { SignIn } from '@/features/account/SignIn'
import { useAccount } from '@/features/account/store'
import { api } from '@/lib/api'

/** An owner's invitation to help manage a shul. */
export function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const status = useAccount((s) => s.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'unknown') return <Centered loading />
  if (status === 'signedOut')
    return (
      <Page>
        <SignIn returnTo={`/invite/${token}`} reason="You’ve been invited to help manage a shul on Beitecha. Sign in to accept." />
      </Page>
    )

  const accept = async () => {
    setBusy(true)
    try {
      const { slug } = await api.acceptInvite(token)
      router.replace(`/${slug}/admin`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Centered title="Join the team" body={error ?? 'You’ve been invited to help manage a shul’s schedule.'}>
      {!error && <Button title="Accept invitation" loading={busy} onPress={accept} />}
    </Centered>
  )
}
