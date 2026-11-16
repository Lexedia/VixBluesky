import { ImageItem } from './normalizePost'


export const galleryUrl = (apiUrl: string, items: ImageItem[]) =>
  `${apiUrl}images/png/${items
    .map((img, i) =>
      img.fullsize
        .split('/')
        .slice(i === 0 ? -2 : -1)
        .join('/')
        .replace(/@jpeg$/, ''),
    )
    .join('/')}`
