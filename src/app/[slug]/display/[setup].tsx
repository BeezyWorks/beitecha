import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { DisplayScreen } from '@/features/display/DisplayScreen'

export default function DisplaySetupPage() {
  const { slug, setup } = useLocalSearchParams<{ slug: string; setup: string }>()
  return <DisplayScreen slug={slug} setup={setup} />
}
