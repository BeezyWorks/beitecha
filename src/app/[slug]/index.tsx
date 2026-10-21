import { useLocalSearchParams } from 'expo-router'
import React, { useEffect } from 'react'

import { Centered } from '@/components/Centered'
import { siddurShulUrl } from '@/lib/config'

/** A shul's public page lives in the Siddur; this keeps old QR codes and links working by sending them there. */
export default function ShulPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  useEffect(() => {
    if (slug) window.location.replace(siddurShulUrl(slug))
  }, [slug])
  return <Centered loading />
}
