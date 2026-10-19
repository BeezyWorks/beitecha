import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { DisplayScreen } from '@/features/display/DisplayScreen'

export default function DisplayPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <DisplayScreen slug={slug} />
}
