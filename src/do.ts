import { DurableObject } from 'cloudflare:workers';

export class DO extends DurableObject<Env> {
    private refreshingAisgToken = false;
    private refreshingDiffrhythmToken = false;

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
    }

    async getDiffrhythmSession(refresh = false) {
        if (refresh) {
            // Prevent concurrent refresh attempts if called rapidly
            if (this.refreshingDiffrhythmToken) {
                // Optional: wait for the ongoing refresh or return stale/error
                // For simplicity, just return current token, refresh will eventually complete
            } else {
                try {
                    this.refreshingDiffrhythmToken = true;
                    await this.refreshDiffrhythmSession();
                } catch (err: any) {
                    return { error: err };
                } finally {
                    this.refreshingDiffrhythmToken = false;
                }
            }
        }

        return this.ctx.storage.get<string>('session_token');
    }

    private async refreshDiffrhythmSession() {
        const existingSessionToken = await this.ctx.storage.get<string>('session_token') || this.env.DIFFRHYTHM_SESSION_COOKIE;
        const headers: HeadersInit = {};

        if (existingSessionToken) {
            headers['Cookie'] = existingSessionToken;
        }

        const response = await fetch("https://diffrhythm.ai/api/auth/session", {
            method: "GET",
            headers: headers,
            redirect: "manual", // Important to handle cookies manually
        });

        if (!response.ok && response.status !== 302) { // 302 is expected on redirect, but we care about cookies
            const errorText = await response.text();
            throw new Error(`Failed to fetch Diffrhythm session: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const setCookieHeader = response.headers.get("Set-Cookie");

        if (!setCookieHeader) {
            throw new Error("No Set-Cookie header found from Diffrhythm.");
        }

        // Example: __Secure-next-auth.session-token=...; Path=/; Expires=...; HttpOnly; SameSite=Lax
        const match = setCookieHeader?.match(/(__Secure-next-auth\.session-token=([^;]+))/);
        
        if (match && match[1]) {
            const sessionToken = match[1]; // match[1] is the full cookie string "name=value"
            await this.ctx.storage.put('session_token', sessionToken);
        } else if (setCookieHeader) {
            throw new Error("__Secure-next-auth.session-token not found in Set-Cookie header.");
        } else {
            throw new Error("Set-Cookie header found but __Secure-next-auth.session-token was not present or in unexpected format.");
        }
    }

    async getTokens(refresh = false) {
        // NOTE: Currently tokens are good for 1 hour

        if (refresh) {
            const expires_at = await this.ctx.storage.get<number>('expires_at') || 0;
            const ten_minutes_in_ms = 10 * 60 * 1000;
            const now = Date.now();

            if (
                !this.refreshingAisgToken
                && (
                    !expires_at
                    || (now + ten_minutes_in_ms) > (expires_at * 1000)
                )
            ) {
                try {
                    this.refreshingAisgToken = true;
                    await this.refreshToken(); // Renamed from refreshToken
                    console.log('AISG Token refreshed');
                } catch (err) {
                    return { error: err };
                } finally {
                    this.refreshingAisgToken = false;
                }
            } else {
                // const secondsRemaining = Math.floor(((expires_at * 1000) - (now + ten_minutes_in_ms)) / 1000);
                // console.log('Token is still valid, seconds remaining:', secondsRemaining.toLocaleString());
            }
        }
        
        return {
            access_token: await this.ctx.storage.get<string>('access_token'),
            refresh_token: await this.ctx.storage.get<string>('refresh_token'),
            expires_at: await this.ctx.storage.get<number>('expires_at'),
        }
    }

    private async refreshToken(retry = true) {
        const refresh_token = await this.ctx.storage.get<string>('refresh_token') || this.env.AISONGGENERATOR_REFRESH_TOKEN;

        await fetch(`https://hjgeamyjogwwmvjydbfm.supabase.co/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                'apikey': this.env.AISONGGENERATOR_API_KEY,
                'Content-Type': 'application/json', // Added Content-Type
            },
            body: JSON.stringify({
                refresh_token: refresh_token,
            }),
        })
        .then(async (res) => {
            if (res.ok) {
                return res.json();
            }

            if (
                retry
                && refresh_token !== this.env.AISONGGENERATOR_REFRESH_TOKEN
            ) {
                try {
                    await this.ctx.storage.put<string>('refresh_token', this.env.AISONGGENERATOR_REFRESH_TOKEN);
                    await this.refreshToken(false);
                } catch {}
            }

            throw await res.json();
        })
        .then(async (res: any) => {
            await this.ctx.storage.put<string>('access_token', res.access_token);
            await this.ctx.storage.put<string>('refresh_token', res.refresh_token);
            await this.ctx.storage.put<number>('expires_at', res.expires_at);
        })
    }
}