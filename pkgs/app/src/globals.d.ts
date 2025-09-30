import { Client } from '@atcute/client'
import { XRPCProcedures, XRPCQueries } from '@atcute/lexicons/ambient'
import type { KVNamespace } from '@cloudflare/workers-types'

declare global {
  interface Env {
    Bindings: {
      BSKY_SERVICE_URL: string;
      BSKY_AUTH_USERNAME: string;
      BSKY_AUTH_PASSWORD: string;
      VIXBLUESKY_APP_DOMAIN: string;
      VIXBLUESKY_API_URL: string;
      sessions: KVNamespace;
    };
    Variables: {
      Agent: Client<XRPCQueries, XRPCProcedures>;
    };
  }
}
