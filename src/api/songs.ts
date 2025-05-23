import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    generateAiSongGeneratorSong,
    getAiSongGeneratorSongResults,
    AiSongGeneratorGenerateParams,
    AiSongGeneratorSong,
} from "./aisonggenerator";
import {
    generateDiffRhythmSong,
    getDiffRhythmSongResults,
    DiffRhythmGenerateParams,
    TransformedSong as DiffRhythmSong, // Renaming for clarity if structures differ significantly
    // Assuming Diffrhythm functions don't need separate Env and can use the common one
} from "./diffrhythm";

// Define a common Env type that satisfies both modules, or ensure they are compatible.
// For this example, we'll assume Hono's Env passed via Context is sufficient if structured correctly.
// type Env = AiSongGeneratorEnv; // Or a merged type if diffrhythm requires more/different env vars

// Define LyricsResponse based on its usage in the original postSongs
// This will be the expected input structure for our new postSongs
interface LyricsResponse {
    title: string;
    style: string[]; // Changed from styles which was a string
    instrumental: boolean;
    lyrics?: string;
    prompt?: string; // For instrumental, primary descriptive text
    description?: string; // Additional description to append to prompt for instrumentals
    public: boolean;
    model?: string;
    // These were in original but seem specific to aisonggenerator or not universally applicable
    // lyrics_mode?: boolean;
    // type?: "desc" | "lyrics";
    // user_id?: string;
    // user_email?: string;
}

export async function getSongs(ctx: Context<{ Bindings: Env }>) {
    const { req, env } = ctx;
    const idsQuery = req.query('ids');
    const source = req.query('source') || 'aisonggenerator'; // Default to aisonggenerator

    if (!idsQuery) {
        return ctx.json({ error: "'ids' query parameter is required" }, 400);
    }
    const ids = idsQuery.split(',');

    let results: Array<AiSongGeneratorSong | DiffRhythmSong> = [];

    try {
        if (source === 'aisonggenerator') {
            // For aisonggenerator, ids are task_ids (identify_id)
            // Env is passed directly; getAiSongGeneratorSongResults will use userId from env
            results = await getAiSongGeneratorSongResults(ids, env);
        } else if (source === 'diffrhythm') {
            // For diffrhythm, ids are uids
            // Env is passed directly; getDiffRhythmSongResults will use userId from env if available or its default
            results = await getDiffRhythmSongResults(ids, env);
        } else {
            return ctx.json({ error: "Invalid 'source'. Must be 'aisonggenerator' or 'diffrhythm'." }, 400);
        }
        return ctx.json(results);
    } catch (error: any) {
        console.error(`Error in getSongs (source: ${source}):`, error.message);
        throw new HTTPException(500, { message: `Failed to retrieve songs: ${error.message}` });
    }
}

export async function postSongs(ctx: Context<{ Bindings: Env }>) {
    const { req, env } = ctx;
    const data: LyricsResponse = await req.json();
    const source = req.query('source') || 'aisonggenerator'; // Default to aisonggenerator

    let taskIds: string[] = []; // For aisonggenerator
    let uid: string = ""; // For diffrhythm

    // Prepare combined description for instrumental songs
    let instrumentalDesc = data.prompt || "";
    if (data.instrumental && data.description) {
        instrumentalDesc += (instrumentalDesc ? "\n" : "") + data.description;
    }

    try {
        if (source === 'aisonggenerator') {
            const params: AiSongGeneratorGenerateParams = {
                title: data.title,
                styles: data.style, // Ensure this is an array of strings
                instrumental: data.instrumental,
                lyrics: data.lyrics,
                description: data.instrumental ? instrumentalDesc : data.lyrics, // Use combinedDesc for instrumental prompt
                isPublic: data.public,
            };
            taskIds = await generateAiSongGeneratorSong(params, env);
            return ctx.json(taskIds); // aisonggenerator returns task_id(s)

        } else if (source === 'diffrhythm') {
            const params: DiffRhythmGenerateParams = {
                title: data.title,
                tags: data.style.join(', '), // Diffrhythm expects comma-separated string for tags
                instrumental: data.instrumental,
                lyrics: data.lyrics,
                description: data.instrumental ? instrumentalDesc : data.lyrics, // Use combinedDesc for instrumental description
                isPublic: data.public,
            };
            uid = await generateDiffRhythmSong(params, env);
            return ctx.json([uid]); // diffrhythm returns a single uid

        } else {
            return ctx.json({ error: "Invalid 'source'. Must be 'aisonggenerator' or 'diffrhythm'." }, 400);
        }
    } catch (error: any) {
        console.error(`Error in postSongs (source: ${source}):`, error.message);
        throw new HTTPException(500, { message: `Failed to generate song: ${error.message}` });
    }
}