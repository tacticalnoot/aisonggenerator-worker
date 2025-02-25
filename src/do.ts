import { DurableObject } from 'cloudflare:workers';
import { fetcher } from 'itty-fetcher';

const supabase = fetcher({ base: 'https://hjgeamyjogwwmvjydbfm.supabase.co' });

export class DO extends DurableObject<Env> {
    constructor(state: DurableObjectState, env: Env) {
        super(state, env);

        state.blockConcurrencyWhile(async () => {
            await this.refreshToken();
        });
    }

    async getToken() {
        const expires_at = await this.ctx.storage.get<number>('expires_at');
        const five_minutes_in_ms = 5 * 60 * 1000;

        if (
            !expires_at 
            || (Date.now() + five_minutes_in_ms) > (expires_at * 1000)
        ) {
            await this.refreshToken();
        }

        return this.ctx.storage.get<string>('access_token');
    }

    private async refreshToken() {
        return supabase.post('/auth/v1/token?grant_type=refresh_token', {
            refresh_token: await this.ctx.storage.get<string>('refresh_token') || this.env.AISONGGENERATOR_REFRESH_TOKEN,
        }, {
            headers: {
                'apikey': this.env.AISONGGENERATOR_API_KEY,
            }
        })
        .then(async (res: any) => {
            console.log(res);
            
            await this.ctx.storage.put<string>('access_token', res.access_token);
            await this.ctx.storage.put<string>('refresh_token', res.refresh_token);
            await this.ctx.storage.put<number>('expires_at', res.expires_at);
        })
        .catch((err: any) => {
            console.error(err);
            throw err
        })
    }
}