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
        model: "v1.0", // "v2.0"
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
    const { access_token, refresh_token } = await stub.getTokens();

    const response = await fetch(`https://aisonggenerator.io/api/song`, {
        method: 'POST',
        headers: {
            // Ensure Cookie format is exactly as expected by the server
            Cookie: `sb-hjgeamyjogwwmvjydbfm-auth-token=${encodeURIComponent(JSON.stringify([access_token, refresh_token, null, null, null]))}`,
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
            // Ensure all items are strings or numbers before returning
            if (resJson.data.every(item => typeof item === 'string' || typeof item === 'number')) {
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

    // Prioritize userIdArg, then env.AISONGGENERATOR_USER_ID.
    // Since AISONGGENERATOR_USER_ID is non-optional in Env, it will always be available as a fallback.
    const currentUserId = userIdArg || env.AISONGGENERATOR_USER_ID;

    let filters = "";
    for (let id of taskIds) {
        filters += `identify_id.eq."${id}",`;
    }
    filters = filters.slice(0, -1); // Remove trailing comma

    // Added identify_id to the select query to potentially map results back if needed
    const supabaseUrl = `https://hjgeamyjogwwmvjydbfm.supabase.co/rest/v1/music?select=music_id,status,audio,identify_id&user_id=eq.${currentUserId}&or=(${filters})`;

    const response = await fetch(supabaseUrl, {
        method: 'GET',
        headers: {
            'apikey': env.AISONGGENERATOR_API_KEY,
            'Accept': 'application/json' // Good practice to include Accept header
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Supabase API error:", errorText);
        throw new Error(`Failed to get songs from Supabase: ${response.status} ${errorText}`);
    }

    const results: AiSongGeneratorSong[] = await response.json();
    return results.map(song => ({
        ...song,
        service: 'aisonggenerator' as const
    }));
} 