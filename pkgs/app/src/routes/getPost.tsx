import { Handler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { fetchPost } from '../lib/fetchPostData';
import { Post } from '../components/Post';
import { parseEmbedImages } from '../lib/parseEmbedImages';
import { checkType } from '../lib/utils';
import { AppBskyFeedGetPosts } from '@atcute/client/lexicons';

export interface VideoInfo {
  url: URL;
  aspectRatio: {
    width: number;
    height: number;
  };
}

interface VideoEmbed {
  $type: string;
  cid: string;
  playlist: string;
  thumbnail: string;
  aspectRatio: {
    width: number;
    height: number;
  };
}

export const getPost: Handler<
  Env,
  '/profile/:user/post/:post' | '/https://bsky.app/profile/:user/post/:post'
> = async (c) => {
  let { user, post } = c.req.param();
  post = post.replaceAll('|', '');
  const isDirect = c.req.query('direct');

  const agent = c.get('Agent');
  try {
    var { data } = await fetchPost(agent, { user, post });
  } catch (e) {
    throw new HTTPException(500, {
      message: `Failed to fetch the post!\n${e}`,
    });
  }

  const fetchedPost = data.posts[0];

  const images = parseEmbedImages(fetchedPost);

  let videoMetaData: VideoInfo | undefined;

  const embed = fetchedPost.embed as typeof fetchedPost.embed & { media: any };

  if (
    checkType('app.bsky.embed.video', embed) ||
    checkType('app.bsky.embed.video', embed?.media)
  ) {
    const videoEmbed = (embed?.media ?? fetchedPost.embed) as VideoEmbed;
    videoMetaData = {
      url: new URL(
        `https://bsky.social/xrpc/com.atproto.sync.getBlob?cid=${videoEmbed.cid}&did=${fetchedPost.author.did}`,
      ),
      aspectRatio: videoEmbed.aspectRatio,
    };
  }

  if (!isDirect) {
    return c.html(
      <Post
        post={fetchedPost}
        url={c.req.path}
        appDomain={c.env.VIXBLUESKY_APP_DOMAIN}
        videoMetadata={videoMetaData}
        apiUrl={c.env.VIXBLUESKY_API_URL}
        images={images}
      />,
    );
  }

  if (Array.isArray(images) && images.length !== 0) {
    const url = images[0].fullsize;
    return c.redirect(url);
  }

  if (videoMetaData) {
    return c.redirect(videoMetaData.url.toString());
  }
};
