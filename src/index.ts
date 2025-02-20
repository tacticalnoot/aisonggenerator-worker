import { getClient } from "./client";
import { Baker } from "./baker";
import { Suno } from "./suno";
import { Clerk } from "./clerk";
import { Browser } from "./browser";

// TODO move this all into a workflow and set some reasonable failsafes and timeouts

export default {
    async fetch(req, env, ctx): Promise<Response> {
        let browser: Browser | undefined;

        try {
            const body = await req.json<{ 
                prompt: string
            }>();

            const baker = await Baker.create(env, ctx);
            const client = await getClient(env, baker);
            const clerk = await Clerk.create(env, client, baker);
            const suno = new Suno(env, client, clerk);

            let captcha_required_res = await suno.captchaRequired();

            console.log('CAPTCHA REQUIRED', captcha_required_res.data.required);

            let gpt_description_prompt: string | null = body.prompt || 'GROOT';

            // try without captcha
            try {
                const generate_res = await suno.generate(gpt_description_prompt);
                return Response.json({
                    captcha: 'none',
                    ...generate_res.data
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

                    const generate_res = await suno.generate(gpt_description_prompt, captcha_token);
                    return Response.json({
                        captcha: 'old',
                        ...generate_res.data
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
            
            gpt_description_prompt = await browser.page.$eval('.custom-textarea', (el) => el.getAttribute('placeholder'));

            if (!gpt_description_prompt) {
                throw new Error('Failed to get gpt_description_prompt');
            }

            const captcha_token = await browser.getCaptchaToken();
            const generate_res = await suno.generate(gpt_description_prompt, captcha_token);

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
                ...generate_res.data
            });
        } catch (err: any) {
            console.error(err);

            // if (browser?.page) {
            //     return new Response(await browser.page.screenshot(), {
            //         headers: { 'Content-Type': 'image/png' }
            //     });
            // } else {
                return new Response(err?.statusText || err?.message || JSON.stringify(err), { status: 400 });
            // }
        } finally {
            if (browser) {
                ctx.waitUntil(browser.close());
            }
        }
    },
} satisfies ExportedHandler<Env>;