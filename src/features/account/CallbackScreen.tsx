import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'

import { Centered } from '@/components/Centered'
import { takeReturnTo, useAccount } from './store'

/** Where Google/Apple sign-in lands (`?ott=` or `?error=`), via auth.baderech.app/handoff. */
export function CallbackScreen() {
  const { ott, error } = useLocalSearchParams<{ ott?: string; error?: string }>()
  const completeHandoff = useAccount((s) => s.completeHandoff)
  const [failure, setFailure] = useState<string | null>(error ? 'Sign-in didn’t finish. Please try again.' : null)

  useEffect(() => {
    if (!ott) return
    completeHandoff(ott)
      .then(() => router.replace(takeReturnTo() as never))
      .catch((e: Error) => setFailure(e.message))
  }, [ott, completeHandoff])

  return failure ? <Centered title="Couldn’t sign in" body={failure} /> : <Centered loading />
}
