import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { PrintScreen } from '@/features/print/PrintScreen'

export default function PrintPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <PrintScreen slug={slug} />
}
