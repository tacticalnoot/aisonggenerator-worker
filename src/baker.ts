import * as cookie from 'cookie';
import type { SerializeOptions } from 'cookie';

export class Baker {
    private env: Env
    private ctx: ExecutionContext

    public cookies: Record<string, string | undefined>;

    private constructor(env: Env, ctx: ExecutionContext, cookie_header?: string) {
        this.env = env;
        this.ctx = ctx;

        this.cookies = {
            ...cookie.parse(env.DOC_COOKIE),
            ...cookie.parse(env.SUNO_COOKIE),
            ...(cookie_header && cookie.parse(cookie_header)),
        }
    }

    public static async create(env: Env, ctx: ExecutionContext): Promise<Baker> {
        const cookie_header = await env.KV.get('COOKIE_HEADER') || undefined;
        return new Baker(env, ctx, cookie_header);
    }

    // NOTE update the page cookies?
        // Likely not necessary as we aren't sending custom fetch requests from inside the browser after making separate ones server side

    public addCookies(cookies: Record<string, string | undefined>) {
        this.cookies = { ...this.cookies, ...cookies };
        this.ctx.waitUntil(this.env.KV.put('COOKIE_HEADER', this.getCookieHeader()));
    }
    public addCookie(name: string, val: string, options: SerializeOptions) {
        let cookie_str = cookie.serialize(name, val, options);
        let cookie_rec = cookie.parse(cookie_str);

        this.cookies = { ...this.cookies, ...cookie_rec };
        this.ctx.waitUntil(this.env.KV.put('COOKIE_HEADER', this.getCookieHeader()));
    }
    public getCookieHeader() {
        const cookie_arr = Object
            .entries(this.cookies)
            .map(([key, value]) => value && cookie.serialize(key, value, {
                domain: '.suno.com',
                path: '/',
                sameSite: 'lax'
            }))
            .filter(Boolean);

        return cookie_arr.join('; ');
    }
    public getCookiesArray() {
        // Protocol.Network.CookieParam
        let cookie_array: any[] = [];

        for (let key in this.cookies) {
            cookie_array.push({
                name: key,
                value: this.cookies[key] + '',
                domain: '.suno.com',
                path: '/',
                sameSite: 'Lax'
            });
        }

        return cookie_array;
    }
}