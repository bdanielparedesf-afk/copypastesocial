export type Calc = {
  mediaCount: number
  accountCount: number
  totalJobs: number
  label: string
}

export function calcJobs(mediaIds: string[], accountIds: string[]): Calc {
  const total = mediaIds.length * accountIds.length

  return {
    mediaCount: mediaIds.length,
    accountCount: accountIds.length,
    totalJobs: total,
    label: `Fotocopiar ${mediaIds.length} videos × ${accountIds.length} destinos = ${total} publicaciones`,
  }
}
