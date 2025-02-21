import { cors, error, IttyRouter, withParams } from "itty-router";
import { generate } from "./api/generate";
import { get } from "./api/get";
import { lyrics } from "./api/lyrics";

const { preflight, corsify } = cors()
const router = IttyRouter()

// TODO try other services:
// https://www.mureka.ai/
// https://www.riffusion.com/
// https://aitubo.ai/
// https://www.trymusicflow.com/
// https://soundraw.io/
// https://www.udio.com/
// https://aisonggenerator.io/
// https://mubert.com/
// https://deepai.org/music

router
    .options('*', preflight)
    .all('*', withParams)
    .get('/api/get', get)
    .post('/api/lyrics', lyrics)
    .post('/api/generate', generate)
    .all('*', () => error(404))

const handler = {
    fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
        router
            .fetch(req, env, ctx)
            .catch((err) => error(
                typeof err?.status === 'number' ? err.status : 400,
                err instanceof Error
                    ? err?.message || err
                    : err
            ))
            .then((r) => corsify(r, req)),
} satisfies ExportedHandler<Env>;

export {
    handler as default
}