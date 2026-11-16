export interface Flags {
  direct: boolean
  gallery: boolean
  videoApi: boolean
  legacy: boolean
  thread: boolean
}

const LETTERS: Record<string, keyof Flags> = {
  r: 'direct',
  g: 'gallery',
  v: 'videoApi',
  l: 'legacy',
  t: 'thread',
}

const QUERY: Record<string, keyof Flags> = {
  direct: 'direct',
  gallery: 'gallery',
  video_api: 'videoApi',
  legacy: 'legacy',
  thread: 'thread',
}


export function parseFlags(url: URL, domains: string[]): Flags {
  const flags: Flags = {
    direct: false,
    gallery: false,
    videoApi: false,
    legacy: false,
    thread: false,
  }

  const host = url.hostname.toLowerCase()
  const domain = domains.find((d) => host.endsWith(`.${d}`))
  if (domain) {
    const labels = host.slice(0, -(domain.length + 1)).split('.')
    for (const label of labels) {
      if (Object.hasOwn(LETTERS, label))
        flags[LETTERS[label]] = true
    }
  }

  for (const [ param, flag ] of Object.entries(QUERY)) {
    const value = url.searchParams.get(param)?.toLowerCase()
    if (value === 'true' || value === '1')
      flags[flag] = true
    else if (value === 'false' || value === '0')
      flags[flag] = false
  }

  return flags
}
