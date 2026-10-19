import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { AdminScreen } from '@/features/admin/AdminScreen'

export default function AdminPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return <AdminScreen slug={slug} />
}
