import { AuthForm, Button, Stack, Text } from '@beezyworks/design'
import React from 'react'

import { DEV_AUTH } from '@/lib/config'
import { useAccount } from './store'

/** The gabbai's sign-in: the shared BeezyWorks account (same as the siddur). */
export function SignIn({ returnTo, reason }: { returnTo: string; reason?: string }) {
  const account = useAccount()
  return (
    <Stack gap="lg">
      <AuthForm
        providers={['apple', 'google']}
        onProvider={(p) => account.signInWith(p, returnTo)}
        onSignIn={({ email, password }) => account.signInEmail(email, password)}
        onSignUp={({ name, email, password }) => account.signUpEmail(name, email, password)}
        onForgotPassword={(email) => account.requestPasswordReset(email)}
        header={
          reason ? (
            <Text variant="body">
              {reason}
            </Text>
          ) : undefined
        }
      />
      {DEV_AUTH && <Button variant="secondary" title="Continue as a dev user" onPress={() => account.signInDev('Gabbai')} />}
    </Stack>
  )
}
