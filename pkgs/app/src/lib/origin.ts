export function publicOrigin(url: URL, domains: string[]): string {
  const host = url.hostname.toLowerCase()
  const domain = domains.find((d) => host === d || host.endsWith(`.${d}`))
  if (domain)
    return `https://${domain}`

  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  return `${isLocal ? url.protocol : 'https:'}//${url.host}`
}
