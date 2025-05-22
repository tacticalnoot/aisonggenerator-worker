import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getLyrics as getSunoLyrics, LyricsStatusResponse } from "./suno"; // Import Suno functions

// Define the unified response type
interface UnifiedLyricsResponse {
    title: string | null;
    lyrics: string | null;
    style: string[];
    service: string;
}

// TODO use this if the below fails https://aisonggenerator.io/api/lyrics-generate
// Consider using the suno lyrics generator

export async function lyrics(ctx: Context<{ Bindings: Env }>) {
    const { req } = ctx;
    const requestBody = await req.text();
    let prompt: string | undefined;

    try {
        const parsedBody = JSON.parse(requestBody);
        prompt = parsedBody.prompt;
    } catch (e) {
        // If parsing fails, assume the body itself is the prompt string
        prompt = requestBody;
    }

    // Attempt 1: https://lyrics-generator.tommy-ni1997.workers.dev
    try {
        const response: any = await fetch('https://lyrics-generator.tommy-ni1997.workers.dev', {
            method: 'POST',
            body: requestBody, // Pass the original request body
        }).then(async (res: any) => {
            if (res.ok) {
                return res.json();
            }
            // Don't throw HTTPException here, just let it be caught to try the next service
            throw new Error(`tommy-ni1997 failed: ${res.status}`);
        });

        if (response && response.lyrics && response.title) {
            return ctx.json({
                title: response.title,
                lyrics: response.lyrics,
                style: response.style ? response.style.split(',').map((s: string) => s.trim()) : [],
                service: "tommy-ni1997",
            } as UnifiedLyricsResponse);
        }
    } catch (error) {
        console.warn("Failed to fetch from tommy-ni1997, trying next service:", error);
    }

    // Attempt 2: Suno getLyrics
    try {
        const sunoResponse: LyricsStatusResponse = await getSunoLyrics(prompt); // Pass the prompt to Suno
        if (sunoResponse.status === 'complete' && sunoResponse.text && sunoResponse.title) {
            return ctx.json({
                title: sunoResponse.title,
                lyrics: sunoResponse.text,
                style: sunoResponse.tags || [],
                service: "suno",
            } as UnifiedLyricsResponse);
        }
    } catch (error) {
        console.warn("Failed to fetch from Suno API:", error);
    }

    // Attempt 3: https://aisonggenerator.io/api/lyrics-generate
    try {
        const response: any = await fetch('https://aisonggenerator.io/api/lyrics-generate', {
            method: 'POST',
            body: requestBody, // Pass the original request body
        })
            .then(async (res: any) => {
                if (res.ok) {
                    return res.json();
                }
                // Don't throw HTTPException here, just let it be caught to try the next service
                throw new Error(`aisonggenerator.io failed: ${res.status}`);
            });
        
        if (response && response.lyrics && response.title) {
            return ctx.json({
                title: response.title,
                lyrics: response.lyrics,
                style: response.tags ? response.tags.split(',').map((s: string) => s.trim()) : (response.style ? response.style.split(',').map((s: string) => s.trim()) : []),
                service: "aisonggenerator.io",
            } as UnifiedLyricsResponse);
        }
    } catch (error) {
        console.warn("Failed to fetch from aisonggenerator.io, trying next service:", error);
        // If all attempts fail, throw an HTTPException
        throw new HTTPException(500, { message: "All lyric generation services failed.", cause: error });
    }

    // If all attempts fail and no specific error was thrown by Suno that we want to propagate
    throw new HTTPException(500, { message: "All lyric generation services failed or returned an invalid response." });
}