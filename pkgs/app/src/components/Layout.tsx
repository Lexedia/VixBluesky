import { html } from 'hono/html'

export interface LayoutProps {
  url: string;
  children: unknown;
}

export const Layout = ({ url, children }: LayoutProps) => {
  const removeLeadingSlash = url.substring(1)
  const redirectUrl = removeLeadingSlash.startsWith('https://')
    ? removeLeadingSlash
    : `https://bsky.app/${removeLeadingSlash}`
  return html`
    <!doctype html>
    <html>
      <head>
        <link rel="canonical" href="${url.substring(1)}" />
        <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
        <meta content="#0085ff" name="theme-color" />
        <meta property="og:site_name" content="VixBluesky" />

        ${children}
        <meta http-equiv="refresh" content="0;url=${redirectUrl}" />
      </head>
    </html>
  `
}
