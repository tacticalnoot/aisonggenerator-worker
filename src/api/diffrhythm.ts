import { getCaptchaToken } from "./2captcha";

// Constants
const DIFFRHYTHM_GENERATE_URL = "https://diffrhythm.ai/api/generate/handleNewV2";
const DIFFRHYTHM_GET_WORKS_URL = "https://diffrhythm.ai/api/works/updateMusicListByIds";

// Default values from example; consider making these configurable or passed as arguments
const DEFAULT_USER_ID = "d4ba8feabe034d0c84f0b2f6210ff633";
const DEFAULT_FINGERPRINT = "a48dab0cfca1490b1c6b26af22919677";

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

// Request body for Diffrhythm's handleNewV2 endpoint
interface DiffRhythmGenerateRequestBody {
    custom_mode: boolean;
    instrumental: boolean;
    input_description: string;
    input_text: string;
    input_title: string;
    input_tags: string;
    user_id: string;
    is_public: boolean;
    cf_token: string;
    fingerprint: string;
}

// Response from Diffrhythm's handleNewV2 endpoint
interface DiffRhythmGenerateResponse {
    uid?: string;
    error?: any; // Define more specific error type if known
    message?: string; // Often present on error
}

// Request body for Diffrhythm's updateMusicListByIds endpoint
interface DiffRhythmGetWorksRequestBody {
    uids: string[];
    user_id: string;
    current_page?: number; // Defaults to 1 if not provided
}

// Individual work item from Diffrhythm's updateMusicListByIds response
interface DiffRhythmWork {
    id: string;
    uid: string;
    input_title: string;
    output_audio_url?: string[] | null; // Array of audio URLs
    output_image_url?: string[] | null;
    status: number; // 0 for completed in example
    // ... other fields from the example if needed
}

// Response from Diffrhythm's updateMusicListByIds endpoint
interface DiffRhythmGetWorksResponse {
    status: number; // Overall status, 0 for success
    data?: DiffRhythmWork[] | null;
    error?: any; // Define more specific error type if known
}

// Desired output format for getDiffRhythmSongResults
export interface TransformedSong {
    music_id: string;
    status: number; // 4 if audio URL exists, 0 otherwise (as per user spec for this transformation)
    audio: string | null;
    service: 'diffrhythm'; // Added service field
}

// --- Helper Functions ---

function extractMusicIdFromUrl(url: string): string {
    try {
        const parsedUrl = new URL(url);
        const pathParts = parsedUrl.pathname.split('/');
        const fileName = pathParts[pathParts.length - 1];
        return fileName.split('.')[0]; // Remove extension
    } catch (e) {
        console.warn(`Could not parse URL or extract music_id from: ${url}`);
        return ""; // Or handle error as appropriate
    }
}

// --- Exported API Functions ---

/**
 * Generates a song (lyrical or instrumental) using the Diffrhythm API.
 */
export async function generateDiffRhythmSong(params: DiffRhythmGenerateParams, env: Env): Promise<string> {
    const cfToken = await getCaptchaToken();
    const userId = params.userId || DEFAULT_USER_ID;
    const fingerprint = params.fingerprint || DEFAULT_FINGERPRINT;

    const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
    const stub = env.DURABLE_OBJECT.get(doid);
    const sessionToken = await stub.getDiffrhythmSession();

    let requestBody: DiffRhythmGenerateRequestBody;

    if (params.instrumental) {
        requestBody = {
            custom_mode: true,
            instrumental: true,
            input_description: "",
            input_text: params.description || "",
            input_title: params.title,
            input_tags: params.tags,
            user_id: userId,
            is_public: params.isPublic === undefined ? false : params.isPublic,
            cf_token: cfToken,
            fingerprint: fingerprint,
        };
    } else {
        requestBody = {
            custom_mode: true,
            instrumental: false,
            input_description: "",
            input_text: params.lyrics || "",
            input_title: params.title,
            input_tags: params.tags,
            user_id: userId,
            is_public: params.isPublic === undefined ? false : params.isPublic,
            cf_token: cfToken,
            fingerprint: fingerprint,
        };
    }

    const response = await fetch(DIFFRHYTHM_GENERATE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
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

    if (result.error || !result.uid) {
        console.error("Diffrhythm generate API returned an error or no UID:", result);
        throw new Error(`Diffrhythm API error: ${result.message || JSON.stringify(result.error) || 'Unknown error during generation'}`);
    }

    return result.uid;
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

    if (result.status !== 0 || !result.data) {
        // Diffrhythm API's own status field indicates an issue, or data is missing
        console.error("Diffrhythm get works API returned an error status or no data:", result);
        if (result.data === null && result.status === 0) { // API might return empty data legitimately
            return [];
        }
        throw new Error(`Diffrhythm API error when fetching works: ${JSON.stringify(result.error) || 'Non-zero status or missing data'}`);
    }

    const transformedSongs: TransformedSong[] = [];

    for (const work of result.data) {
        if (work.output_audio_url && work.output_audio_url.length > 0) {
            for (const audioUrl of work.output_audio_url) {
                if (audioUrl) { // Ensure URL is not null or empty
                    const musicId = extractMusicIdFromUrl(audioUrl);
                    if (musicId) { // Only add if music_id could be extracted
                        transformedSongs.push({
                            music_id: musicId,
                            status: 4, // Status 4 if audio URL exists
                            audio: audioUrl,
                            service: 'diffrhythm' as const, // Added service field
                        });
                    }
                }
            }
        }
        // If output_audio_url is empty or null for a work, it contributes no entries, per requirement.
    }

    // "if `output_audio_url` is empty just return an empty array."
    // This condition seems to apply if *all* works result in no audio URLs,
    // or if the initial uids list was for works that don't produce output_audio_urls.
    // The current loop structure handles this naturally: if no valid audio URLs are found
    // across all processed UIDs, transformedSongs will remain empty.

    return transformedSongs;
}