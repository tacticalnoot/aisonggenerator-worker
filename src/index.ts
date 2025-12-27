import { lyrics } from './api/lyrics';
import { getSongs, postSongs } from './api/songs';
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { getClerkToken } from './api/suno';

export { DO } from "./do";

export const app = new Hono<{ Bindings: Env }>()

app
    .all('*', cors())
    .post('/api/lyrics', lyrics)
    .post('/api/songs', postSongs)
    .get('/api/songs', getSongs)
    // Audio proxy for CORS-enabled streaming (enables Web Audio API visualizers)
    .get('/audio/:songId', async (ctx) => {
        const songId = ctx.req.param('songId');
        const audioUrl = `https://api.smol.xyz/song/${songId}.mp3`;

        try {
            const response = await fetch(audioUrl);

            if (!response.ok) {
                return ctx.text('Audio not found', 404);
            }

            return new Response(response.body, {
                status: 200,
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Cache-Control': 'public, max-age=86400',
                },
            });
        } catch (error) {
            console.error('Audio proxy error:', error);
            return ctx.text('Error fetching audio', 500);
        }
    })
    .onError((err, ctx) => {
        console.error(err)

        if (err instanceof HTTPException) {
            return err.getResponse()
        } else {
            return ctx.text(err.message, 500)
        }
    })
    .notFound((ctx) => ctx.body(null, 404))

export default {
    fetch: app.fetch,
    async scheduled(ctrl: ScheduledController, env: Env, ctx: ExecutionContext) {
        const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
        const stub = env.DURABLE_OBJECT.get(doid);

        try {
            await getClerkToken();
        } catch (e: any) {
            console.error("Error refreshing Suno session during scheduled task:", e.message);
        }

        // Refresh AISG token
        try {
            await stub.getTokens(true);
        } catch (e: any) {
            console.error("Error or Exception during AISG token refresh in scheduled task:", e.message);
        }

        // Refresh Diffrhythm session token
        try {
            await stub.getDiffrhythmSession(true);
        } catch (e: any) {
            console.error("Error refreshing Diffrhythm session during scheduled task:", e.message);
        }
    },
}