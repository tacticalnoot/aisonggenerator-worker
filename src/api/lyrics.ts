import { fetcher } from "itty-fetcher";
import { json, RequestLike } from "itty-router";

// https://aisonggenerator.io/api/lyrics-generate
const lyricsgenerate = fetcher({ base: 'https://lyrics-generator.tommy-ni1997.workers.dev' });

export async function lyrics(req: RequestLike) {
    const body = await req.json()
    const lyrics: LyricsResponse = await lyricsgenerate
        .post('/', body)
        .then((res: any) => {
            return {
                ...res,
                style: res.style.split(', ')
            }
        })

    return json(lyrics)
}