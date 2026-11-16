import { ImageItem } from './normalizePost'

export interface GalleryEnv {
  VIXBLUESKY_API_URL: string
  GALLERY_MAX_IMAGES?: string
  GALLERY_FORMAT?: string
}

export function galleryUrl(env: GalleryEnv, items: ImageItem[]): string {
  const max = Math.max(1, Number.parseInt(env.GALLERY_MAX_IMAGES ?? '', 10) || 4)
  const format = env.GALLERY_FORMAT ?? 'png'
  const path = items
    .slice(0, max)
    .map((img, i) =>
      img.fullsize
        .split('/')
        .slice(i === 0 ? -2 : -1)
        .join('/')
        .replace(/@jpeg$/, ''),
    )
    .join('/')
  return `${env.VIXBLUESKY_API_URL}images/${format}/${path}`
}
