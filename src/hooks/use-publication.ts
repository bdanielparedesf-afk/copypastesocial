'use client'

import { useState } from 'react'

import { calcJobs } from '@/lib/publishing/job-calculator'

export function usePublication() {
  const [selectedMedia, setSelectedMedia] = useState<string[]>([])
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const calc = calcJobs(selectedMedia, selectedAccounts)
  const canPublish = calc.totalJobs > 0

  return {
    selectedMedia,
    setSelectedMedia,
    selectedAccounts,
    setSelectedAccounts,
    calc,
    canPublish,
  }
}
