import { AxiosInstance } from "axios";
import { Baker } from "./baker";

// TODO there's at least one, maybe more, clerk calls being made and I should emulate those maybe in a cron to keep the tokens, auth and sessions fresh
    // environment
    // verify
    // touch

export class Clerk {
    private session_id: string

    private env: Env
    private client: AxiosInstance
    private baker: Baker

    private constructor(env: Env, client: AxiosInstance, baker: Baker, session_id: string) {
        this.env = env;
        this.client = client;
        this.baker = baker;
        this.session_id = session_id;
    }

    public static async create(env: Env, client: AxiosInstance, baker: Baker): Promise<Clerk> {
        const session_id = await this.getSessionId(env, client, baker);
        
        // `getToken` call required to set the `__session` cookie
        await this.getToken(env, client, baker, session_id);

        return new Clerk(env, client, baker, session_id);
    }

    public async getToken() {
        return Clerk.getToken(this.env, this.client, this.baker, this.session_id);
    }

    private static async getSessionId(env: Env, client: AxiosInstance, baker: Baker) {
        const sessionUrl = `${env.CLERK_BASE_URL}/v1/client?_is_native=true&__clerk_api_version=${env.CLERK_API_VERSION}&_clerk_js_version=${env.CLERK_JS_VERSION}`;
        const sessionResponse = await client.get(sessionUrl, {
            headers: {
                Authorization: baker.cookies.__client
            }
        });
    
        if (!sessionResponse?.data?.response?.last_active_session_id) {
            throw new Error('Failed to get session id, you may need to update the SUNO_COOKIE');
        }
    
        return sessionResponse.data.response.last_active_session_id;
    }

    private static async getToken(env: Env, client: AxiosInstance, baker: Baker, session_id: string) {
        const renewUrl = `${env.CLERK_BASE_URL}/v1/client/sessions/${session_id}/tokens?_is_native=true&__clerk_api_version=${env.CLERK_API_VERSION}&_clerk_js_version=${env.CLERK_JS_VERSION}`;
        const renewResponse = await client.post(
            renewUrl,
            {},
            {
                headers: {
                    Authorization: baker.cookies.__client
                }
            }
        );
    
        if (!renewResponse?.data?.jwt) {
            throw new Error('Failed to get token, you may need to update the SUNO_COOKIE');
        }
    
        const token: string = renewResponse.data.jwt;
    
        baker.addCookie('__session', token, {
            domain: '.suno.com',
            path: '/',
            sameSite: 'lax',
        });
    
        return token;
    }
}