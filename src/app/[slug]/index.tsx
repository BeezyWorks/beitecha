import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { PublicScreen } from '@/features/public/PublicScreen'

export default function ShulPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <PublicScreen slug={slug} />
}
