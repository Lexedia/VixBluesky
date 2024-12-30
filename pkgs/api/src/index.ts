import fastify from "fastify";
import { bufferVideo } from "./utils";

const envToLogger = {
  development: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
  production: true,
  test: false,
};

type Env = keyof typeof envToLogger;

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly NODE_ENV: Env;
      readonly PORT: string | undefined;
    }
  }
}

const { NODE_ENV: env = "development", PORT } = process.env;

const app = fastify({ logger: envToLogger[env] });

app.addContentTypeParser("*", (_, __, done) => done(null));

app.get("/", async (_, res) => res.redirect("https://bskx.app"));

// serve 0 bytes favicon so browsers don't spam the server
app.get("/favicon.ico", (_, res) => res.send(""));

app.get<{ Params: { "*": string } }>(
  "/generate/*",
  {
    schema: {
      params: {
        type: "object",
        properties: {
          "*": { type: "string" },
        },
        required: ["*"],
      },
    },
  },
  (req, res) => {
    let baseUrl = req.params["*"];
    if (baseUrl.endsWith(".mp4")) {
      baseUrl = baseUrl.slice(0, -4);
    }

    const payload = Buffer.from(baseUrl, "base64").toString().split(";");

    const [did, id, quality] = payload;

    if (!did?.startsWith("did") || !id || !quality) {
      // Legacy/Invalid payload
      return res.status(400).send({ error: "Invalid payload" });
    }

    const url = `https://video.bsky.app/watch/${did}/${id}/${quality}/video.m3u8`;

    try {
      res.header("Content-Type", "video/mp4");
      res.header("Cache-Control", "public, max-age=604800");
      res.header('Connection', 'keep-alive');
      bufferVideo(url, res);
      return res;
    } catch (error) {
      console.error(error);
      res.status(400).send({ error: "Failed to fetch video" });
    }
  }
);

const port = PORT ? Number(PORT) : 3000;

app.listen({ port, host: "0.0.0.0" });
