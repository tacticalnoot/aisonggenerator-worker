import { DurableObject } from 'cloudflare:workers';

export class DO extends DurableObject<Env> {
    private refreshing = false;

    constructor(state: DurableObjectState, env: Env) {
        super(state, env);
    }

    async getTokens(refresh = false) {
        // NOTE: Currently tokens are good for 1 hour

        if (refresh) {
            const expires_at = await this.ctx.storage.get<number>('expires_at') || 0;
            const ten_minutes_in_ms = 10 * 60 * 1000;
            const now = Date.now();

            if (
                !this.refreshing
                && (
                    !expires_at
                    || (now + ten_minutes_in_ms) > (expires_at * 1000)
                )
            ) {
                try {
                    this.refreshing = true;
                    await this.refreshToken();
                } catch (err) {
                    return { error: err };
                } finally {
                    this.refreshing = false;
                }
            } else {
                const secondsRemaining = Math.floor(((expires_at * 1000) - (now + ten_minutes_in_ms)) / 1000);
                console.log('Token is still valid, seconds remaining:', secondsRemaining.toLocaleString());
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