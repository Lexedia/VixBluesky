import { AppBskyActorDefs } from '@atcute/bluesky'
import {
  Component, ComponentEmbed, fits, MAX_BYTES,
} from './componentEmbed'
import {
  detectFacets, escapeInline, markdownUrl, richMarkdown,
} from './richtext'
import { ellipsis } from './utils'

const ACCENT = 0x0085FF
const MAX_BUTTONS = 5
const MAX_LABEL = 80

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 })
export const count = (n: number | undefined) => compact.format(n ?? 0)

export const profileUrl = (handle: string) => `https://bsky.app/profile/${handle}`

const isHttp = (url: string) => {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

const parseDate = (iso: string | undefined) => {
  const date = iso ? new Date(iso) : undefined
  return date && !Number.isNaN(date.getTime()) ? date : undefined
}

export function joined(createdAt: string | undefined): string | undefined {
  const date = parseDate(createdAt)
  return date && `Joined ${date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
}

export function discordTimestamp(iso: string | undefined, style: 'D' | 'R' | 'f' = 'D'): string | undefined {
  const date = parseDate(iso)
  return date && `<t:${Math.floor(date.getTime() / 1000)}:${style}>`
}

interface BuildOptions {
  bioChars?: number
  links: number
}

function build(profile: AppBskyActorDefs.ProfileViewDetailed, { bioChars, links }: BuildOptions): ComponentEmbed {
  const url = profileUrl(profile.handle)
  const name = escapeInline(profile.displayName || profile.handle)
  const components: Component[] = []

  if (profile.banner)
    components.push({ type: 12, items: [ { media: { url: profile.banner } } ] })

  const header: Component = {
    type: 10,
    content: `## ${name}\n[@${escapeInline(profile.handle)}](${markdownUrl(url)})\n` +
      `-# **${count(profile.followersCount)}** followers · **${count(profile.followsCount)}** following · ` +
      `**${count(profile.postsCount)}** posts`,
  }
  components.push(profile.avatar
    ? { type: 9, components: [ header ], accessory: { type: 11, media: { url: profile.avatar } } }
    : header)

  const bio = profile.description?.trim()
  if (bio) {
    const text = bioChars !== undefined && Array.from(bio).length > bioChars
      ? escapeInline(ellipsis(bio, bioChars))
      : richMarkdown(bio, detectFacets(bio))
    components.push({ type: 10, content: text })
  }

  const since = discordTimestamp(profile.createdAt)
  if (since)
    components.push({ type: 10, content: `-# 📅 Joined ${since}` })

  const buttons: Component[] = (profile.links ?? [])
    .filter((l) => isHttp(l.url))
    .slice(0, Math.min(links, MAX_BUTTONS))
    .map((l) => ({
      type: 2,
      style: 5,
      label: ellipsis(l.title?.trim() || new URL(l.url).hostname, MAX_LABEL),
      url: l.url,
    }))

  if (buttons.length) {
    components.push({ type: 14, divider: true, spacing: 1 })
    components.push({ type: 1, components: buttons })
  }

  return { component: { type: 17, accent_color: ACCENT, components } }
}

export function profileComponentEmbed(
  profile: AppBskyActorDefs.ProfileViewDetailed,
  maxBytes = MAX_BYTES,
): ComponentEmbed | null {
  for (let links = MAX_BUTTONS; links >= 0; links--) {
    const embed = build(profile, { links })
    if (fits(embed, maxBytes))
      return embed
  }

  let lo = 0
  let hi = Array.from(profile.description ?? '').length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(build(profile, { links: 0, bioChars: mid }), maxBytes))
      lo = mid
    else
      hi = mid - 1
  }
  const shortened = build(profile, { links: 0, bioChars: lo })
  return fits(shortened, maxBytes) ? shortened : null
}
