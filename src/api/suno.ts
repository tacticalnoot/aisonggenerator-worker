import { env } from "cloudflare:workers";

const CLERK_TOKEN_URL = "https://clerk.suno.com/v1/client/sessions/sess_2xSAFw8ETkY7LedHzLUfnp15K6o/tokens?_is_native=true&_clerk_js_version=5.67.2&__clerk_api_version=2025-04-10";
const LYRICS_API_BASE_URL = "https://studio-api.prod.suno.com/api";

interface ClerkTokenResponse {
    object: string;
    jwt: string;
}

interface LyricsGenerationResponse {
    id: string;
}

export interface LyricsStatusResponse {
    text: string | null;
    title: string | null;
    status: string;
    error_message: string | null;
    tags: string[] | null;
}

async function getClerkToken(): Promise<string> {
    const response = await fetch(CLERK_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.SUNO_SESSION_TOKEN}`,
        },
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch Clerk token: ${response.statusText}`);
    }
    const data: ClerkTokenResponse = await response.json();
    return data.jwt;
}

async function requestLyricGeneration(jwt: string, prompt?: string): Promise<string> {
    const response = await fetch(`${LYRICS_API_BASE_URL}/generate/lyrics`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            prompt: prompt || "",
            lyrics_model: "default"
        }) // Assuming an optional prompt can be sent.
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to request lyric generation: ${response.statusText}, ${errorBody}`);
    }
    const data: LyricsGenerationResponse = await response.json();
    return data.id;
}

export async function getLyrics(prompt?: string): Promise<LyricsStatusResponse> {
    const clerkJwt = await getClerkToken();
    const lyricRequestId = await requestLyricGeneration(clerkJwt, prompt);

    const pollUrl = `${LYRICS_API_BASE_URL}/generate/lyrics/${lyricRequestId}`;
    let attempts = 0;
    const maxAttempts = 12; // 1 minute / 5 seconds

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;

        try {
            const response = await fetch(pollUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${clerkJwt}`,
                },
            });

            if (!response.ok) {
                if (attempts >= maxAttempts) {
                    throw new Error(`Failed to get lyrics after ${maxAttempts} attempts. Last status: ${response.statusText}`);
                }

                continue; 
            }

            const data: LyricsStatusResponse = await response.json();

            if (data.status === 'complete') {
                return data;
            } else if (data.status === 'error' || data.status === 'failed') {
                throw new Error(`Lyric generation failed: ${data.error_message || 'Unknown error'}`);
            }
        } catch (error) {
            if (attempts >= maxAttempts) {
                if (error instanceof Error) {
                     throw new Error(`Failed to get lyrics after ${maxAttempts} attempts. Last error: ${error.message}`);
                }
                throw new Error(`Failed to get lyrics after ${maxAttempts} attempts due to an unknown polling error.`);
            }
        }
    }

    throw new Error('Lyric generation timed out after 1 minute.');
}