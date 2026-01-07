import { getCaptchaToken } from "./2captcha";

// Constants
const DIFFRHYTHM_GENERATE_URL = "https://diffrhythm.ai/api/generate/v1/music/create";
const DIFFRHYTHM_GET_WORKS_URL = "https://diffrhythm.ai/api/materials/music/getMusicsByIds";

// Default values from example; consider making these configurable or passed as arguments
const DEFAULT_USER_ID = "d4ba8feabe034d0c84f0b2f6210ff633";
const DEFAULT_FINGERPRINT = "e61b80a2fa74c435f4d3922f6a5e3673";

// --- Interfaces ---

// Input for our generateDiffRhythmSong function
export interface DiffRhythmGenerateParams {
    title: string;
    tags: string; // Comma-separated string, e.g., "Indie, Melancholy, Storytelling"
    isPublic?: boolean;
    instrumental: boolean;
    lyrics?: string; // For lyrical mode
    description?: string; // For instrumental mode or custom lyrical mode
    userId?: string;
    fingerprint?: string;
}

// Request body for Diffrhythm's v1/music/create/ endpoint
interface DiffRhythmGenerateRequestBody {
    custom_mode: boolean;
    instrumental: boolean;
    model: string;
    is_public: boolean;
    input_title: string;
    input_tags: string;
    input_text: string;
    user_id: string;
    fingerprint: string;
    generator: string;
}

// Response from Diffrhythm's v1/music/create endpoint
interface DiffRhythmGenerateResponse {
    code: number;
    message: string;
    data?: Array<{
        code: number;
        message: string;
        data: {
            batch_uid: string;
            uid: string;
            task_id: string;
        };
    }>;
    error?: any;
}

// Request body for Diffrhythm's getMusicsByIds endpoint
interface DiffRhythmGetWorksRequestBody {
    uids: string[];
    user_id: string;
    current_page: number;
}

// Individual work item from Diffrhythm's getMusicsByIds response
interface DiffRhythmWork {
    uid: string;
    audio_url: string | null;
    batch_uid: string;
    created_at: string;
    fingerprint: string | null;
    generator: string;
    input_data: {
        model: string;
        style: string;
        title: string;
        prompt: string;
        customMode: boolean;
        instrumental: boolean;
    };
    result_data: {
        model: string;
        duration?: number; // Only present when complete
    };
    status: number; // 0 = processing, 1 = success
    user_id: string;
    works_name: string | null;
    works_type: string;
    source: string;
}

// Response from Diffrhythm's getMusicsByIds endpoint is an array directly
type DiffRhythmGetWorksResponse = DiffRhythmWork[];

// Desired output format for getDiffRhythmSongResults
export interface TransformedSong {
    music_id: string;
    status: number; // 4 if audio URL exists, 0 otherwise (as per user spec for this transformation)
    audio: string | null;
    service: 'diffrhythm'; // Added service field
}

// --- Exported API Functions ---

/**
 * Generates a song (lyrical or instrumental) using the Diffrhythm API.
 */
export async function generateDiffRhythmSong(params: DiffRhythmGenerateParams, env: Env): Promise<string[]> {
    const cfToken = await getCaptchaToken();
    const userId = params.userId || DEFAULT_USER_ID;
    const fingerprint = params.fingerprint || DEFAULT_FINGERPRINT;

    const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
    const stub = env.DURABLE_OBJECT.get(doid);
    const sessionToken = await stub.getDiffrhythmSession();

    const requestBody: DiffRhythmGenerateRequestBody = {
        custom_mode: true,
        instrumental: params.instrumental,
        model: "V4",
        is_public: params.isPublic === undefined ? false : params.isPublic,
        input_title: params.title,
        input_tags: params.tags,
        input_text: params.instrumental ? (params.description || "") : (params.lyrics || ""),
        user_id: userId,
        fingerprint: fingerprint,
        generator: "music",
    };

    const response = await fetch(DIFFRHYTHM_GENERATE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "cf-client-token": cfToken,
            ...(typeof sessionToken === 'string' && sessionToken ? { "Cookie": sessionToken } : {}),
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Diffrhythm generate API error response:", errorBody);
        throw new Error(`Failed to generate song with Diffrhythm: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const result: DiffRhythmGenerateResponse = await response.json();

    if (result.code !== 200 || !result.data || result.data.length === 0) {
        console.error("Diffrhythm generate API returned an error or no data:", result);
        throw new Error(`Diffrhythm API error: ${result.message || JSON.stringify(result.error) || 'Unknown error during generation'}`);
    }

    // Extract all UIDs from the batch response
    const uids = result.data
        .filter(item => item.code === 200 && item.data?.uid)
        .map(item => item.data.uid);

    if (uids.length === 0) {
        throw new Error(`Diffrhythm API error: No successful songs in batch`);
    }

    return uids;
}

/**
 * Retrieves generated songs from Diffrhythm and transforms them into the specified format.
 */
export async function getDiffRhythmSongResults(uids: string[], env: Env, userId?: string): Promise<TransformedSong[]> {
    if (!uids || uids.length === 0) {
        return [];
    }

    const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
    const stub = env.DURABLE_OBJECT.get(doid);
    const sessionToken = await stub.getDiffrhythmSession();

    // Prioritize userId argument, then internal default
    const currentUserId = userId || DEFAULT_USER_ID;

    const requestBody: DiffRhythmGetWorksRequestBody = {
        uids: uids,
        user_id: currentUserId,
        current_page: 1,
    };

    const response = await fetch(DIFFRHYTHM_GET_WORKS_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(typeof sessionToken === 'string' && sessionToken ? { "Cookie": sessionToken } : {}),
        },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Diffrhythm get works API error response:", errorBody);
        throw new Error(`Failed to get song results from Diffrhythm: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const result: DiffRhythmGetWorksResponse = await response.json();

    if (!result || !Array.isArray(result)) {
        console.error("Diffrhythm get works API returned unexpected response:", result);
        return [];
    }

    // Diffrhythm status codes:
    // 0 = processing (no audio), 1 = complete (has audio), >1 = error (e.g., 9 for content policy)
    // Maps to workflow status: 0 (waiting) or 4 (complete) to align with aisonggenerator's status codes

    // Build a map of uid -> transformed song for O(1) lookup
    const songMap = new Map<string, TransformedSong>();

    for (const work of result) {
        if (work.audio_url) {
            // Always use work.uid as music_id for consistency - it's stable across the entire lifecycle
            // The audio filename extracted from URL was previously used here but caused ID changes
            // between polling calls (uid during processing → filename after completion)
            songMap.set(work.uid, {
                music_id: work.uid,
                status: 4, // Status 4 if audio URL exists
                audio: work.audio_url,
                service: 'diffrhythm' as const,
            });
        } else if (work.status === 0 || work.status === 1) {
            // Status 0 = processing (normal case)
            // Status 1 without audio = edge case safety net (shouldn't normally happen)
            songMap.set(work.uid, {
                music_id: work.uid,
                status: 0,
                audio: null,
                service: 'diffrhythm' as const,
            });
        } else if (work.status > 1) {
            // Error status (e.g., 9 for content policy violation)
            songMap.set(work.uid, {
                music_id: work.uid,
                status: -1,
                audio: null,
                service: 'diffrhythm' as const,
            });
        }
    }

    // Return songs in the same order as input uids to guarantee consistent ordering
    const transformedSongs: TransformedSong[] = [];
    for (const uid of uids) {
        const song = songMap.get(uid);
        if (song) {
            transformedSongs.push(song);
        }
    }

    return transformedSongs;
}