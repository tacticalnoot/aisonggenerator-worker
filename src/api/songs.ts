import { fetcher } from "itty-fetcher";
import { json, RequestLike } from "itty-router";

const supabase = fetcher({ base: 'https://hjgeamyjogwwmvjydbfm.supabase.co' });
const aisonggenerator = fetcher({ base: 'https://aisonggenerator.io' });

export async function getSongs(req: RequestLike, env: Env) {
    const ids = req.query.ids.split(',')

    let filters = ""

    for (let id of ids) {
        filters += `identify_id.eq."${id}",`
    }

    filters = filters.slice(0, -1)

    const res = await supabase
        .get(`/rest/v1/music?select=music_id,status,audio&user_id=eq.${env.AISONGGENERATOR_USER_ID}&or=(${filters})`, 
            {}, 
            {
                headers: {
                    'apikey': env.AISONGGENERATOR_API_KEY
                }
            }
        )
    
    return json(res)
}

export async function postSongs(req: RequestLike, env: Env) {
    const data: LyricsResponse = await req.json()
    const body = {
        lyrics_mode: true,
        instrumental: false,
        lyrics: data.lyrics,
        title: data.title,
        styles: data.style.join(', '),
        type: "lyrics",
        user_id: env.AISONGGENERATOR_USER_ID,
        is_private: false
    }

    const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
    const stub = env.DURABLE_OBJECT.get(doid);
    const { access_token, refresh_token } = await stub.getTokens();

    const res = await aisonggenerator
        .post('/api/song', body, {
            headers: {
                Cookie: `sb-hjgeamyjogwwmvjydbfm-auth-token=${encodeURIComponent(`'["${access_token}","${refresh_token}",null,null,null]'`)}`
            }
        })
        .then((res: any) => {
            if (
                res.success 
                && res.code === 200 
                && res.data?.length > 0
            ) {
                return res.data
            } else if (res.data?.taskId) {
                return [res.data.taskId]
            } else {
                throw res
            }
        })

    return json(res)
}