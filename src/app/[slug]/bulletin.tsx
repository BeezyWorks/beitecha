import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { BulletinScreen } from '@/features/bulletin/BulletinScreen'

export default function BulletinPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <BulletinScreen slug={slug} />
}
