import { Layout } from './Layout'

export const NotFound = ({ url, type }: { url: string; type: 'post' | 'profile' }) => {
  return <Layout url={url}>
    <meta property="og:description" content={`Sorry, this ${type} doesn't seem to exist, has it been deleted?
Though, here's a cat to lighten up your mood; ᓚᘏᗢ`} />
  </Layout>
}
