import { AppBskyFeedDefs } from '@atcute/client/lexicons'
import { indent, is } from './utils'

export function parseEmbedDescription(post: AppBskyFeedDefs.PostView): string {
  if (is('app.bsky.feed.post', post.record)) {
    if (is('app.bsky.embed.record#view', post.embed)) {
      if (is('app.bsky.embed.record#viewRecord', post.embed.record)) {
        const name = post.embed.record.author.displayName
          ? `${post.embed.record.author.displayName} (@${post.embed.record.author.handle})`
          : `@${post.embed.record.author.handle}`
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error

        return `${post.record.text}\n\nQuoting ${name}\n➥${indent(post.embed.record.value.text, 2)}`
      }
    }

    if (is('app.bsky.embed.external', post.record.embed)) {
      return `${post.record.text}\n\n${post.record.embed.external.title}\n${post.record.embed.external.description}`
    }

    return post.record.text
  }

  return ''
}
