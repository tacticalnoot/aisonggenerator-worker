import type { AxiosInstance } from "axios";
import type { Clerk } from "./clerk";

// TODO use custom gen
    // Support exclude styles

// TODO gen lyrics
    // with ReMi model

// TODO get songs by id

export class Suno {
    private env: Env
    private client: AxiosInstance
    private clerk: Clerk

    constructor(env: Env, client: AxiosInstance, clerk: Clerk) {
        this.env = env;
        this.client = client;
        this.clerk = clerk;
    }

    async captchaRequired() {
        return this.client.post(`${this.env.SUNO_BASE_URL}/api/c/check`, {
            ctype: 'generation'
        }, {
            headers: {
                Authorization: `Bearer ${await this.clerk.getToken()}`,
            },
        })
    }
    
    async generate(
        gpt_description_prompt: string,
        captcha_token?: string,
    ) {
        // TODO can we generate to a specific workspace?
        // https://suno.com/create?wid=1bb1552c-3d4b-4b7e-a1a6-d49bb87bbe39 (SMOL)
    
        return this.client.post(`${this.env.SUNO_BASE_URL}/api/generate/v2/`, {
            token: captcha_token,
            gpt_description_prompt,
            mv: "chirp-v3-5", // "chirp-v4", // chirp-v3-5
            prompt: "",
            metadata: {
                lyrics_model: "remi-v1", // "default" // remi-v1
            },
            make_instrumental: false,
            user_uploaded_images_b64: [],
            generation_type: "TEXT"
        }, {
            headers: {
                Authorization: `Bearer ${await this.clerk.getToken()}`,
            },
        });
    }
}