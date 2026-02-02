import { AppBskyFeedDefs } from '@atcute/bluesky'
import { ellipsis, indent, is } from './utils'

export function parseEmbedDescription(post: AppBskyFeedDefs.PostView, parentPost?: AppBskyFeedDefs.PostView): string {
  if (is('app.bsky.feed.post', post.record)) {
    let text = post.record.text

    if (is('app.bsky.embed.record#view', post.embed)) {
      if (is('app.bsky.embed.record#viewRecord', post.embed.record)) {
        const name = post.embed.record.author.displayName
          ? `${post.embed.record.author.displayName} (@${post.embed.record.author.handle})`
          : `@${post.embed.record.author.handle}`
        text = `${post.record.text}\n\nQuoting ${name}\n➥${indent(post.embed.record.value.text, 2)}`
      }
    }

    if (is('app.bsky.embed.external', post.record.embed)) {
      text = `${post.record.text}\n\n${post.record.embed.external.title}\n${post.record.embed.external.description}`
    }

    if (parentPost && is('app.bsky.feed.post', parentPost.record)) {
      const name = parentPost.author.displayName
        ? `${parentPost.author.displayName} (@${parentPost.author.handle})`
        : `@${parentPost.author.handle}`

      const parentText = ellipsis(parentPost.record.text, 256)
      return `Replying to ${name}${parentText.length != 0 ? `: "${parentText}"` : ''}\n\n${text}`
    }

    return text
  }

  return ''
}
