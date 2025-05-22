import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getLyrics as getSunoLyrics, LyricsStatusResponse } from "./suno"; // Import Suno functions
import { songWrite } from "./cf"; // Import songWrite

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
        console.warn("Failed to fetch from Suno API, trying next service:", error);
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
        console.warn("Failed to fetch from aisonggenerator.io, trying next service (Cloudflare AI):", error);
    }

    // Attempt 4: Cloudflare AI songWrite
    try {
        const cfApiResponse = await songWrite(ctx.env, prompt || "");

        // Check if cfApiResponse is not a stream and has the 'response' property as a string
        if (cfApiResponse && typeof (cfApiResponse as any).response === 'string') {
            const cfAiOutput = cfApiResponse as { response: string }; // Type assertion
            const parsedCfResponse = JSON.parse(
                cfAiOutput.response.replace(
                    /"lyrics":\s*"(.*?)"(?=,|"style")/s,
                    (_, lyrics) => {
                        const escaped = lyrics
                            .replace(/\\/g, '\\\\')      // Escape backslashes
                            .replace(/"/g, '\\"')        // Escape double quotes
                            .replace(/\r?\n/g, '\\n');   // Escape newlines
                        return `"lyrics": "${escaped}"`;
                    }
                )
            );
            if (parsedCfResponse.title && parsedCfResponse.lyrics && Array.isArray(parsedCfResponse.style)) {
                return ctx.json({
                    title: parsedCfResponse.title.trim(),
                    lyrics: parsedCfResponse.lyrics.trim(),
                    style: parsedCfResponse.style,
                    service: "cloudflare-ai",
                } as UnifiedLyricsResponse);
            }
        }
        // If CF AI response is invalid, not the expected object, or structure is not as expected, it will fall through
    } catch (error) {
        console.warn("Failed to generate lyrics using Cloudflare AI:", error);
        // This is now the last attempt, so if it fails, throw the final HTTPException
        throw new HTTPException(500, { message: "All lyric generation services failed.", cause: error });
    }

    // If all attempts fail and no specific error was thrown by the last service that we want to propagate,
    // or the last service returned an invalid response structure.
    throw new HTTPException(500, { message: "All lyric generation services failed or returned an invalid response." });
}