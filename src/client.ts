import axios from "axios";
import { Baker } from "./baker";
import * as cookie from 'cookie';

export async function getClient(env: Env, baker: Baker) {
    const browser_token = btoa(`'{"timestamp": ${Date.now()}}'`);
    const device_id = baker.cookies.ajs_anonymous_id || crypto.randomUUID();

    const client = axios.create({
        withCredentials: true,
        headers: {
            'Affiliate-Id': 'undefined',
            'Device-Id': device_id,
            'Sec-Ch-Ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            // 'Browser-Token': `'{"token":"${browser_token}"}'`,
            // 'Content-Type': 'text/plain;charset=UTF-8',
            'Referer': 'https://suno.com/',
            'User-Agent': env.USER_AGENT,
        }
    });

    client.interceptors.request.use((req) => {
        req.headers.set('Cookie', baker.getCookieHeader(), true);
        return req;
    });

    client.interceptors.response.use((res) => {
        const set_cookie_header = res.headers["set-cookie"] as unknown as string | undefined;

        if (set_cookie_header) {
            baker.addCookies(cookie.parse(set_cookie_header));
        }

        return res;
    });

    return client;
}