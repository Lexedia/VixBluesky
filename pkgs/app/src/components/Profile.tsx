import { raw } from 'hono/html'
import { AppBskyActorDefs } from '@atcute/bluesky'
import { Layout } from './Layout'
import { OEmbedTypes } from '../routes/getOEmbed'
import { ComponentEmbed, serializeEmbed } from '../lib/componentEmbed'
import { count, joined } from '../lib/profileEmbed'

type ProfileView = AppBskyActorDefs.ProfileViewDetailed

interface ProfileProps {
  profile: ProfileView;
  url: string;
  origin: string;
  stats?: boolean;
}

const titleOf = (p: ProfileView) => p.displayName ? `${p.displayName} (@${p.handle})` : `@${p.handle}`

const describe = (p: ProfileView, stats?: boolean) =>
  [
    p.description?.trim(),
    stats && `👥 ${count(p.followersCount)} followers · ${count(p.followsCount)} following · ${count(p.postsCount)} posts`,
    joined(p.createdAt),
  ].filter(Boolean).join('\n\n')

const ProfileMeta = ({ profile, origin, stats }: Omit<ProfileProps, 'url'>) => (
  <>
    <title>{titleOf(profile)}</title>
    <meta property="og:type" content="profile" />
    <meta property="og:title" content={titleOf(profile)} />
    <meta property="og:description" content={describe(profile, stats)} />
    <meta property="profile:username" content={profile.handle} />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content={titleOf(profile)} />
    <meta name="twitter:creator" content={`@${profile.handle}`} />
    {profile.avatar && <meta property="og:image" content={profile.avatar} />}
    {profile.createdAt && <meta property="article:published_time" content={profile.createdAt} />}
    <link
      rel="alternate"
      type="application/json+oembed"
      href={`${origin}/oembed?${new URLSearchParams({
        type: String(OEmbedTypes.Profile),
        followers: count(profile.followersCount),
        following: count(profile.followsCount),
        posts: count(profile.postsCount),
        avatar: profile.avatar ?? '',
      })}`}
    />
  </>
)

export const Profile = ({
  profile, url, origin, stats,
}: ProfileProps) => (
  <Layout url={url}>
    <ProfileMeta profile={profile} origin={origin} stats={stats} />
  </Layout>
)

export const ProfileComponents = ({
  profile, url, origin, embed,
}: ProfileProps & { embed: ComponentEmbed }) => (
  <Layout url={url}>
    <ProfileMeta profile={profile} origin={origin} />
    {raw(`<script type="application/json" id="discord:component-embed">${serializeEmbed(embed)}</script>`)}
  </Layout>
)
