import { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export async function getSongs(ctx: Context<{ Bindings: Env }>) {
    const { req, env } = ctx
    const ids = req.query('ids')?.split(',');

    let filters = ""

    for (let id of ids || []) {
        filters += `identify_id.eq."${id}",`
    }

    filters = filters.slice(0, -1)

    const res = await fetch(`https://hjgeamyjogwwmvjydbfm.supabase.co/rest/v1/music?select=music_id,status,audio&user_id=eq.${env.AISONGGENERATOR_USER_ID}&or=(${filters})`, {
        method: 'GET',
        headers: {
            'apikey': env.AISONGGENERATOR_API_KEY
        }
    })
        .then(async (res: any) => {
            if (res.ok) {
                return res.json();
            }

            throw new HTTPException(400, { res: ctx.json(await res.text(), 400) });
        })

    return ctx.json(res);
}

export async function postSongs(ctx: Context<{ Bindings: Env }>) {
    const { req, env } = ctx
    const data: LyricsResponse = await req.json()

    // {
    //     "lyrics_mode": false,
    //     "instrumental": true,
    //     "lyrics": "",
    //     "description": "\"A neon dreamscape awakens, pulsating synths swirling like restless spirits, a driving beat unfurls like a promise, carrying you through the velvety darkness of a moonlit, urban oasis\"",
    //     "title": "",
    //     "styles": "",
    //     "style_negative": "",
    //     "type": "desc",
    //     "model": "v1.0",
    //     "user_id": "",
    //     "user_email": "",
    //     "is_private": false
    // }

    // {
    //     "lyrics_mode": true,
    //     "instrumental": true,
    //     "lyrics": "Verse 1:\n\nCruising down the skyline, lights begin to fade,\nThe neon dreams are fading, but my heart’s not afraid.\nThe city’s hum is distant, but it calls me like the night,\nI'm chasing all the echoes of a neon city light.\n\nChorus:\n\nOn the skyline drive, I feel the rhythm alive,\nWith every beat of the drums, I’m drifting through the sky.\nThe stars are dancing on the edge of time,\nLost in the glow, I’m feeling so divine.\n\nVerse 2:\n\nThe city’s pulse is fading, but it’s etched into my mind,\nThese roads will take me places that I’ll never leave behind.\nThe synths are calling softly, like a breeze through the trees,\nI’m floating in the dreamscape where the world feels so free.\n\nChorus:\n\nOn the skyline drive, I feel the rhythm alive,\nWith every beat of the drums, I’m drifting through the sky.\nThe stars are dancing on the edge of time,\nLost in the glow, I’m feeling so divine.\n\nBridge:\n\nEvery turn, every curve, brings me closer to the sky,\nThe dream is never ending, as the city passes by.\nWith dreamy drums and synths so high,\nI’m forever lost in this skyline ride.\n\nOutro:\n\nSo let the skyline drive me, where the stars collide,\nIn the light of the future, I’m forever gonna ride.",
    //     "description": "",
    //     "title": "Skyline Drive",
    //     "styles": "Synthwave, Dreamy, Electronic",
    //     "style_negative": "",
    //     "type": "lyrics",
    //     "model": "v1.0",
    //     "user_id": "",
    //     "user_email": "",
    //     "is_private": false
    // }

    let body = {
        lyrics_mode: true,
        instrumental: false,
        lyrics: "",
        description: "",
        title: data.title,
        styles: data.style.join(', '),
        // style_negative: "",
        type: "lyrics",
        model: "v1.0", // "v2.0"
        user_id: env.AISONGGENERATOR_USER_ID,
        // user_email: "",
        is_private: data.public === false ? true : false,
    }

    // TODO I think the description mode context length is much shorter than the lyrics mode 
    // but has a higher chance of producing a song without lyrics
    // likely need to trim down the prompt to whatever the context length is (which I have no idea about)
    // if we do that it get's a little dicey because most style prompts come at the end of the prompt
    // and we don't want to lose that
    if (data.instrumental) {
        body.lyrics_mode = false;
        body.instrumental = true;
        // Ensure description doesn't exceed max length for API
        body.description = data.prompt.substring(0, 400);
        // body.description = `
        //     # Prompt
        //     ${data.prompt}
            
        //     # Description
        //     ${data.description}
        // `;
        body.type = "desc";
    } else {
        body.lyrics = data.lyrics;
    }

    const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
    const stub = env.DURABLE_OBJECT.get(doid);
    const { access_token, refresh_token } = await stub.getTokens();

    const res = await fetch(`https://aisonggenerator.io/api/song`, {
        method: 'POST',
        headers: {
            Cookie: `sb-hjgeamyjogwwmvjydbfm-auth-token=${encodeURIComponent(`'["${access_token}","${refresh_token}",null,null,null]'`)}`
        },
        body: JSON.stringify(body)
    })
        .then(async (res: any) => {
            if (res.ok) {
                return res.json();
            }

            throw new HTTPException(400, { res: ctx.json(await res.text(), 400) });
        })
        .then((res) => {
            if (res?.task_id) {
                return [res.task_id]
            } else if (res?.data?.taskId) {
                return [res.data.taskId]
            } else if (res?.data?.length > 0) {
                return res.data
            } else if (res?.jobs?.length) {
                return res.jobs.map((job: { id: string }) => job.id)
            } else {
                throw res
            }
        })

    return ctx.json(res)
}