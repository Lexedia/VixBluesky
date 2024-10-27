import { AppBskyFeedDefs } from '@atcute/client/lexicons';
import { checkType, indent } from './utils';

export function parseEmbedDescription(post: AppBskyFeedDefs.PostView): string {
  const isQuote =
    checkType('app.bsky.feed.post', post.record) &&
    (checkType('app.bsky.embed.record#view', post.embed) ||
      checkType('app.bsky.embed.recordWithMedia#view', post.embed));

  let embed;
  if(isQuote){
    // @ts-expect-error
    embed = post.embed.record?.record ?? post.embed.record;
  }
  
  return isQuote
    ? // @ts-expect-error
      `${post.record.text}\n\nQuoting @${embed.author.handle}\n➥${indent(embed.value.text, 2)}`
    : // @ts-expect-error
      post.record.text;
}
