import { Client } from '@atcute/client'
import type { KVNamespace } from '@cloudflare/workers-types'
import type { Flags } from './lib/flags'
import type { TranslatorAi } from './lib/translate'

declare global {
  interface Env {
    Bindings: {
      BSKY_SERVICE_URL: string;
      BSKY_AUTH_USERNAME: string;
      BSKY_AUTH_PASSWORD: string;
      VIXBLUESKY_APP_DOMAIN: string;
      VIXBLUESKY_API_URL: string;
      AI?: TranslatorAi;
      GALLERY_MAX_IMAGES?: string;
      GALLERY_FORMAT?: string;
      sessions: KVNamespace;
    };
    Variables: {
      Agent: Client;
      Flags: Flags;
      Origin: string;
    };
  }
}
