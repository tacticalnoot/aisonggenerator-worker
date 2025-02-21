import { getClient } from "../client";
import { Baker } from "../baker";
import { Suno } from "../suno";
import { Clerk } from "../clerk";
import { Browser } from "../browser";
import { processClips } from "../utils";

export async function generate(req: Request, env: Env, ctx: ExecutionContext) {
    let browser: Browser | undefined;

    try {
        // TODO Support `mv` model

        const body = await req.json<{ 
            title: string
            prompt: string
            tags: string[]
            negative_tags?: string[]
        }>();

        if (
            !body.title
            || !body.prompt
            || body.tags.length < 2
        ) {
            throw new Error('Missing required fields');
        }

        const baker = new Baker(env);
        const client = await getClient(env, baker);
        const clerk = await Clerk.create(env, client, baker);
        const suno = new Suno(env, client, clerk);

        // TODO this is an experiment
        // If this says captcha required is it true?
        // If it says captcha not required is it true?
        // If it is always true we can bypass our two attempts below
        const captcha_required_res = await suno.captchaRequired();
        console.log('CAPTCHA REQUIRED', captcha_required_res.data.required);

        // try without captcha
        try {
            const generate_res = await suno.generate(body);
            return Response.json({
                captcha: 'none',
                clips: processClips(generate_res.data.clips),
            })
        } 

        // try with captcha
        catch(err) {
            console.log('Failed without CAPTCHA');
            console.error(err);

            try {
                const captcha_token = await env.KV.get('CAPTCHA_TOKEN') || undefined;

                if (!captcha_token) {
                    throw new Error('Failed to get CAPTCHA_TOKEN');
                }

                const generate_res = await suno.generate(body, captcha_token);
                return Response.json({
                    captcha: 'old',
                    clips: processClips(generate_res.data.clips),
                })
            } 

            // try click
            catch(err) {
                console.log('Failed with CAPTCHA');
                console.error(err);
            }
        }

        browser = await Browser.launch(env, baker);

        await browser.goto('https://suno.com/create');
        await browser.setSiteKey();

        const captcha_token = await browser.getCaptchaToken();
        const generate_res = await suno.generate(body, captcha_token);

        // await browser.page.waitForSelector('[aria-label="Create"]')
        // console.log('Found "Create"');

        // return new Response(await browser.page.screenshot(), {
        //     headers: { 'Content-Type': 'image/png' }
        // });

        // return new Response(await browser.page.content(), {
        //     headers: { 'Content-Type': 'text/html' }
        // });

        return Response.json({
            captcha: 'new',
            clips: processClips(generate_res.data.clips),
        });
    } finally {
        // Close out the browser in case of either success or failure
        if (browser) {
            ctx.waitUntil(browser.close());
        }
    }
}