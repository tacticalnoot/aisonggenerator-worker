// Interface for the parameters to generate a song
export interface AiSongGeneratorGenerateParams {
    title: string;
    styles: string[]; // e.g., ["Synthwave", "Dreamy", "Electronic"]
    instrumental: boolean;
    lyrics?: string; // For lyrical mode
    description?: string; // For instrumental mode (maps to description)
    isPublic: boolean; // True if public, false if private
}

// Interface for the structure of a song result from aisonggenerator/Supabase
export interface AiSongGeneratorSong {
    music_id: string; // This is the actual music_id from Supabase
    status: number;
    audio: string | null;
    service: 'aisonggenerator'; // Added service field
    // Include other fields if needed, like identify_id if you want to map back to task_id
    identify_id?: string; // The task_id used for generation
}

// More specific type for the aisonggenerator.io response
interface AiSongGeneratorApiResponse {
    task_id?: string | number; // Allow number
    data?: { taskId?: string | number; [index: number]: string | number; } | (string | number)[] | string | number; // Allow number and (string | number)[]
    jobs?: { id: string | number }[]; // Allow number for id
    // Potentially other fields based on actual API responses
}

// Interface for the getStatus endpoint response
// Note: This endpoint returns progressive updates - audio can be null, empty string, or a URL
// as the song generation progresses through different status values (1, 2, 4, etc.)
interface GetStatusResponse {
    success: boolean;
    data?: {
        music_id: string;
        status: number;
        audio: string | null; // Can be null, empty string "", or URL during progressive generation
        identify_id?: string;
        [key: string]: any; // Allow other fields we don't need
    };
}

// Type for the data returned from getStatus endpoint
type GetStatusData = NonNullable<GetStatusResponse['data']>;


/**
 * Generates a song using the aisonggenerator.io service.
 * @param params Parameters for song generation.
 * @param env Environment bindings.
 * @returns A promise that resolves to an array of task IDs.
 */
export async function generateAiSongGeneratorSong(
    params: AiSongGeneratorGenerateParams,
    env: Env
): Promise<string[]> {
    let body: any = {
        lyrics_mode: true,
        instrumental: false,
        lyrics: "",
        description: "",
        title: params.title,
        styles: params.styles.join(', '),
        type: "lyrics",
        model: "v3.0",
        user_id: env.AISONGGENERATOR_USER_ID,
        is_private: !params.isPublic, // Invert isPublic for is_private
    };

    if (params.instrumental) {
        body.lyrics_mode = false;
        body.instrumental = true;
        body.description = params.description?.substring(0, 380) || ""; // Ensure description doesn't exceed max length
        body.type = "desc";
    } else {
        body.lyrics = params.lyrics || "";
    }

    const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
    const stub = env.DURABLE_OBJECT.get(doid);
    const { access_token, refresh_token, expires_at } = await stub.getTokens();

    const response = await fetch(`https://aisonggenerator.io/api/song`, {
        method: 'POST',
        headers: {
            // Ensure Cookie format is exactly as expected by the server
            // Cookie: `sb-hjgeamyjogwwmvjydbfm-auth-token=${encodeURIComponent(JSON.stringify([access_token, refresh_token, null, null, null]))}`,
            Cookie: `sb-hjgeamyjogwwmvjydbfm-auth-token.0=base64-${btoa(JSON.stringify({
                access_token,
                token_type: "bearer",
                expires_in: 3600,
                expires_at,
                refresh_token
            }))};`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("aisonggenerator.io API error:", errorText);
        throw new Error(`Failed to post song to aisonggenerator.io: ${response.status} ${errorText}`);
    }

    const resJson: AiSongGeneratorApiResponse = await response.json();

    if (resJson.task_id !== undefined && resJson.task_id !== null) { // Case 1: res.task_id (string or number)
        return [String(resJson.task_id)];
    } else if (resJson.data && typeof (resJson.data as { taskId?: string | number }).taskId !== 'undefined' && (resJson.data as { taskId?: string | number }).taskId !== null) { // Case 2: res.data.taskId (string or number)
        return [String((resJson.data as { taskId: string | number }).taskId)];
    } else if (resJson.data && (resJson.data as any).length !== undefined && (resJson.data as any).length > 0) { 
        // Case 3: res.data with length > 0 (covers data being a non-empty array or non-empty string/number)
        if (Array.isArray(resJson.data)) {
            // Check if all items have music_id property (Case 3a: array of objects with music_id)
            if (resJson.data.every((item: any) => item?.music_id !== undefined && item?.music_id !== null)) {
                return resJson.data.map((item: any) => String(item.music_id)); // Extract and convert music_id to string
            }
            // Check if all items are strings or numbers (Case 3b: array of strings/numbers)
            else if (resJson.data.every(item => typeof item === 'string' || typeof item === 'number')) {
                return resJson.data.map(item => String(item)); // Convert all to string
            }
        } else if (typeof resJson.data === 'string' || typeof resJson.data === 'number') {
            // data is a non-empty string or a number (length > 0 for string is checked by outer condition)
            return [String(resJson.data)]; // Wrap and convert to string
        }
    } else if (resJson.jobs && resJson.jobs.length > 0 && resJson.jobs[0]?.id !== undefined && resJson.jobs[0]?.id !== null) { // Case 4: res.jobs with id (string or number)
        return resJson.jobs.map((job: { id: string | number }) => String(job.id)); // Convert all to string
    }
    
    console.error("Unexpected response structure from aisonggenerator.io or failed to extract valid task IDs:", resJson);
    throw new Error('Failed to extract task_id from aisonggenerator.io response');
}

/**
 * Retrieves song results from Supabase based on task IDs (identify_id).
 * @param taskIds An array of task IDs (identify_id in Supabase).
 * @param env Environment bindings.
 * @param userIdArg Optional userId argument, to be prioritized
 * @returns A promise that resolves to an array of AiSongGeneratorSong objects.
 */
export async function getAiSongGeneratorSongResults(
    taskIds: string[],
    env: Env,
    userIdArg?: string
): Promise<AiSongGeneratorSong[]> {
    if (!taskIds || taskIds.length === 0) {
        return [];
    }

    // Make parallel requests to the getStatus endpoint for each taskId
    const responses = await Promise.all(
        taskIds.map(async (id) => {
            const response = await fetch(
                `https://aisonggenerator.io/api/musicLibrary/getStatus?musicId=${id}`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Failed to get status for musicId ${id}:`, errorText);
                // Return null for failed requests instead of throwing to allow other requests to complete
                return null;
            }

            const json: GetStatusResponse = await response.json();
            // Check if response has success: true and data
            if (json.success && json.data) {
                return json.data;
            }
            return null;
        })
    );

    // Transform responses maintaining input order (taskIds order)
    // Note: audio can be null or empty string during progressive generation - normalize to null
    const results: AiSongGeneratorSong[] = [];

    for (let i = 0; i < taskIds.length; i++) {
        const data = responses[i];
        if (data !== null) {
            results.push({
                music_id: data.music_id,
                status: data.status,
                // Handle progressive generation: null, empty string "", or URL - normalize empty/null to null
                audio: (data.audio && typeof data.audio === 'string' && data.audio.trim() !== '') ? data.audio : null,
                identify_id: data.identify_id,
                service: 'aisonggenerator' as const
            });
        }
    }

    return results;
} 