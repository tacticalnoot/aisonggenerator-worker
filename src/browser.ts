import puppeteer from "@cloudflare/puppeteer";
import type { Browser as PuppeteerBrowser, Page } from "@cloudflare/puppeteer";
import { Baker } from "./baker";
import { sleep } from "./utils";
import { Solver } from "@2captcha/captcha-solver";

export class Browser {
    private env: Env
    private sitekey: string | null = null

    public browser: PuppeteerBrowser
    public page: Page

    private constructor(env: Env, browser: PuppeteerBrowser, page: Page) {
        this.env = env;
        this.browser = browser;
        this.page = page;
    }

    public static async launch(env: Env, baker: Baker): Promise<Browser> {
        const browser = await puppeteer.launch(env.BROWSER);
        // const context = await browser.createIncognitoBrowserContext();

        console.log('Browser launched');

        const page = await browser.newPage(); // context.newPage();

        page.setDefaultTimeout(60000);
        await page.setUserAgent(env.USER_AGENT);
        await page.setViewport({ width: 0, height: 0 });

        // TODO do a full audit of all the cookies and make sure we're not missing anything
        // Might also be worth looking into setting localStorage and sessionStorage
        // Might also be worth looking into a fake mouse movement tool

        await page.setCookie(...baker.getCookiesArray());

        console.log('Page setup');

        return new Browser(env, browser, page);
    }

    public close() {
        return this.browser.close();
    }

    public async goto(url: string) {
        await this.page.goto(url, {
            referer: 'https://www.google.com/',
            waitUntil: 'domcontentloaded',
            timeout: 0
        });

        console.log('Page loaded');
    }

    public async setSiteKey(ms = 10000) {
        await new Promise(async (resolve, reject) => {
            const timeout = setTimeout(() => reject('`getSiteKey` timeout'), ms);

            while(true) {
                await sleep(500);
        
                const frames = await this.page.$$('iframe');
                const sitekey = await new Promise<string | null>(async (resolve) => {
                    for (const frame of frames) {
                        const src = await frame.evaluate((el) => el.getAttribute('src'));
        
                        if (src && src.includes('sitekey')) {
                            const url = new URL(src);
        
                            for (let kv of url.hash.split('&')) {
                                const [key, val] = kv.split('=');
        
                                if (key === 'sitekey') {
                                    clearTimeout(timeout);
                                    resolve(val);
                                    break;
                                }
                            }
                        }
                    }
        
                    resolve(null);
                });
        
                if (sitekey) {
                    console.log('SITEKEY', sitekey);
                    this.sitekey = sitekey;
                    resolve(sitekey);
                    break;
                }
            }

            reject('Failed to get sitekey');
        });
    }

    async getCaptchaToken(): Promise<string> {
        if (!this.sitekey) {
            throw new Error('No sitekey set');
        }
        
        // NOTE When checkResponse.data.required is true the app is somehow generating a silent captcha
        // "P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.hadwYXNza2V5xQWTOV1rcSCBSEebGKC-A7YJaFnaO-v3u7IeShhbyO-AuOo7om-Tgi58NdvxQxrPPD2bQR38iKJ_-YVUwab0GUOqt0ktCxCJlYyZSngXrw6CzOhsPjBOsx2fwH2qllmwWbnof_8oUUAXu6wmjwwIRbGjkz6qHGKWTEFEQfEvCNM4CJDTycJFB0hLWsTczOvq2oZE1S56GUwpSyWFnt7iyGsLBXfOWgUHr9Yl0Rn6QB-UwAVwMCinLZfenRW02wj16bVj3100MiNprwGYIohUp8F3F-I7d1QzX1hmTf4EqeN-YmqplYJox8Kf47kMnGmH1YYgvcIdTwjmBeAEmzg1Wn-xpU0TVWeO2T_pJenmjwFCqB3HDX-V1q-GpTXWpgrk7spx12Bd-fPrRFQX-4yMnX_POhXBs2x-dlxS5GjcHd4_HmG-1aQtGMx8kfXUo4geYYHke8Ed08XdSL1WnEp8vQRy4kboYxPvVY747CBY_VBjcvzWl9c0AK4exOHB6ByV0IbIUn22hjjh-zHg11BUC44P-jxzZhna5c76_cz1qQu6-J9UhbNWpfNmyhjW4KE1TFDqGA2O2MsEUnnUeygC8JC8ZSBCcW-QL0zqq8tE_kCQKhTVrWyxbgNXSTL7jjeFMiaUISJp_WAAChlfTxzTSJGCA8pq-gUi_9RS6JjrxCjWMUecnbVJwSi6-04MYSQei0Bxbo3spivDVmccj9z3srhrc1cI7WnRj2vZIA148Mwbb9JdS8__W-h-Y66N4FVzvhJ9ZZh7MStJU0Sqk2-P9GsrlUZlC6bbRnQBPC60uszoy95MeQPtolJKhPv4XNvS1Gqg1r_sWmI6UPZPKBUNC8CO3NYx2dK1azYC4TyCaEepZTrWFbQNxLVr2pwWmnsEHS4hIaIhZrBIxGr1i_SbcMBkdsatIi4-L47Vvrt8g-1ebQN-4pVFbjrN7l1uxWcd4wLykTBo4jF5X8X4cHi2Gh0tmKDTK1v2HTgoRVDK3g4CQb_apoFdtr2JQzN_Sg_ALNlDagnq1yt-5QhJfNW-ZRIb6ArF0Buh_i7CBx3Tr86nlyUe8caC9tvYlun1kARi9Dvr3bl2npsX7NgxHXkbRKMsdEglPmnV8MbNjcLXDjd5cEEfLXHeJNXqp-SN5eRzrLR3k2RjKX-gxxxSEsOJ04hm_XQpyvXYtKi2EwGPkJCDUovfmcrfscKcVscwgJTPVVXGLN1aXlnBx9ArWl_MlV6EO6e5bg5EI_B-FjSa9IWHseI5Zd-fLwV7ZlDUJBbmUUooUAD3B8CbDjJNlsLVwwhmwSbYgHwgXJVyl9uIJ2hEOmAZ0g9ojUl-4EGZeVg7Uvje1tESwUXi3e8mjdDf4aucYfNs5LzkiFTDQz2X2UV7_ZGyzFODNjC384Fm-84dqb7DqwwIe8dQxnbFLcofvYwLBqC6t5CAUdj7CSv0uD-Ej8LO1P66o4kGy3G3imXjHgtogBhBqwtxAT8KuZGu1kknTfdeHu-cDRSor8Z2TNh1DKxpaBTFkT6_nnK8Pj2acc8HKLSNNphXiiLqWS5owEq9yW3mC5w-NC4BLl8bDglGX8OC0MWWeTAPbCYTybRqhoijikHQ_FdwKH4xZnoYJq8-mPwftdRlw9SeZb2i1kSYzNNgaUNslBnr1kxejmSyjz-YvQ-MTwY-qKNYqcpGbiUCOnJoPbyQyg6g5dhDAcPQeZVWKI0y5aY75fYHCD3HYaAwK4WWXm4zwBEOvIMEUM4CJNSzh56_n0jMDtEeevL9B67XoMoXm_6UHRka85UBb9TGcw0eGKxb00z_7XcaVEipq57S6Pezg2I1n2nZw_KuV0RpH7BOQiclb5jsOwfeH2ApihgNB8RZbNaRgASGHcsOo2wdBC03KmvLmYGB0HcTNhH_EJ2jZXhwzme2jF2oc2hhcmRfaWTOMa1MgaJrcqgxYTljNDVlY6JwZAA.2qiCr8JjAYUsxzaPE3L8LLOtujWu9pUkNEProLDtS2s"
        // I should sort out if I can gen the same thing (maybe with `Clerk.client.`)

        // NOTE I see in suno a token in a payload from https://api.hcaptcha.com/getcaptcha/d65453de-3f1a-4aac-9366-a0f06e52b2ce
        // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJmIjowLCJzIjoyLCJ0IjoidyIsImQiOiJvU1pJTGFsaGllQTNNWGhlMEtrcDZrMWhQaEZMYjNhN3FvTzdIRHAvTW95Y21uUXJMdzZHU20ycm5NRnFsSHZCNXE0dURQN3BhRUo0OGpZRDNTMFp3RE1COGU3dm1BNW51ZHhvSnUwZDJDMlZUM1JJT1l2VUNKN0crd2hTdS9xc2xuSGhKcE5QeUxjOVNmQTZQZ0J1N0JCSWJBcEd4aGE1ZlVMQ2ZaQzh0TEVZci9yTHVXN1F6OGYyVjduM0ZpOEh0Y3VVc3BiMEpsR3lVdHhNRGxuN3F4WTBmUjVBcUdUU21DelczOHBlbWVsd1R6dHc5S0RhS0ZXTUwrUzZkSGs9aEJSV2pvMUo2TE5SWk84UCIsImwiOiIvYy85MTI0ZmZkOGY1ZjJjNmUzMzdkN2JjYTlhZWJiNDBmYmRiNzhkZGU0MjBmM2U2YjE1NmI4MjA0NDViZjNkMWEyIiwiaSI6InNoYTI1Ni02Y0lpTWppTmlyYTZDTVBxeFV5c2xSVmI3TVc0NWk1NXFxVmk3dld6d3hzPSIsImUiOjE3NDAwMTgzOTMsIm4iOiJoc3ciLCJjIjoxMDAwfQ.ygogryCZwWh7uHziZ3gC3CGGVQXsUPN3l0QnYEPRBSI
        // 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
        // that is then used in the v2/ generate call prefixed with P1_
        // "P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.hadwYXNza2V5xQWTOV1rcSCBSEebGKC-A7YJaFnaO-v3u7IeShhbyO-AuOo7om-Tgi58NdvxQxrPPD2bQR38iKJ_-YVUwab0GUOqt0ktCxCJlYyZSngXrw6CzOhsPjBOsx2fwH2qllmwWbnof_8oUUAXu6wmjwwIRbGjkz6qHGKWTEFEQfEvCNM4CJDTycJFB0hLWsTczOvq2oZE1S56GUwpSyWFnt7iyGsLBXfOWgUHr9Yl0Rn6QB-UwAVwMCinLZfenRW02wj16bVj3100MiNprwGYIohUp8F3F-I7d1QzX1hmTf4EqeN-YmqplYJox8Kf47kMnGmH1YYgvcIdTwjmBeAEmzg1Wn-xpU0TVWeO2T_pJenmjwFCqB3HDX-V1q-GpTXWpgrk7spx12Bd-fPrRFQX-4yMnX_POhXBs2x-dlxS5GjcHd4_HmG-1aQtGMx8kfXUo4geYYHke8Ed08XdSL1WnEp8vQRy4kboYxPvVY747CBY_VBjcvzWl9c0AK4exOHB6ByV0IbIUn22hjjh-zHg11BUC44P-jxzZhna5c76_cz1qQu6-J9UhbNWpfNmyhjW4KE1TFDqGA2O2MsEUnnUeygC8JC8ZSBCcW-QL0zqq8tE_kCQKhTVrWyxbgNXSTL7jjeFMiaUISJp_WAAChlfTxzTSJGCA8pq-gUi_9RS6JjrxCjWMUecnbVJwSi6-04MYSQei0Bxbo3spivDVmccj9z3srhrc1cI7WnRj2vZIA148Mwbb9JdS8__W-h-Y66N4FVzvhJ9ZZh7MStJU0Sqk2-P9GsrlUZlC6bbRnQBPC60uszoy95MeQPtolJKhPv4XNvS1Gqg1r_sWmI6UPZPKBUNC8CO3NYx2dK1azYC4TyCaEepZTrWFbQNxLVr2pwWmnsEHS4hIaIhZrBIxGr1i_SbcMBkdsatIi4-L47Vvrt8g-1ebQN-4pVFbjrN7l1uxWcd4wLykTBo4jF5X8X4cHi2Gh0tmKDTK1v2HTgoRVDK3g4CQb_apoFdtr2JQzN_Sg_ALNlDagnq1yt-5QhJfNW-ZRIb6ArF0Buh_i7CBx3Tr86nlyUe8caC9tvYlun1kARi9Dvr3bl2npsX7NgxHXkbRKMsdEglPmnV8MbNjcLXDjd5cEEfLXHeJNXqp-SN5eRzrLR3k2RjKX-gxxxSEsOJ04hm_XQpyvXYtKi2EwGPkJCDUovfmcrfscKcVscwgJTPVVXGLN1aXlnBx9ArWl_MlV6EO6e5bg5EI_B-FjSa9IWHseI5Zd-fLwV7ZlDUJBbmUUooUAD3B8CbDjJNlsLVwwhmwSbYgHwgXJVyl9uIJ2hEOmAZ0g9ojUl-4EGZeVg7Uvje1tESwUXi3e8mjdDf4aucYfNs5LzkiFTDQz2X2UV7_ZGyzFODNjC384Fm-84dqb7DqwwIe8dQxnbFLcofvYwLBqC6t5CAUdj7CSv0uD-Ej8LO1P66o4kGy3G3imXjHgtogBhBqwtxAT8KuZGu1kknTfdeHu-cDRSor8Z2TNh1DKxpaBTFkT6_nnK8Pj2acc8HKLSNNphXiiLqWS5owEq9yW3mC5w-NC4BLl8bDglGX8OC0MWWeTAPbCYTybRqhoijikHQ_FdwKH4xZnoYJq8-mPwftdRlw9SeZb2i1kSYzNNgaUNslBnr1kxejmSyjz-YvQ-MTwY-qKNYqcpGbiUCOnJoPbyQyg6g5dhDAcPQeZVWKI0y5aY75fYHCD3HYaAwK4WWXm4zwBEOvIMEUM4CJNSzh56_n0jMDtEeevL9B67XoMoXm_6UHRka85UBb9TGcw0eGKxb00z_7XcaVEipq57S6Pezg2I1n2nZw_KuV0RpH7BOQiclb5jsOwfeH2ApihgNB8RZbNaRgASGHcsOo2wdBC03KmvLmYGB0HcTNhH_EJ2jZXhwzme2jF2oc2hhcmRfaWTOMa1MgaJrcqgxYTljNDVlY6JwZAA.2qiCr8JjAYUsxzaPE3L8LLOtujWu9pUkNEProLDtS2s"

        // MAYBE
        // await hcaptcha.execute({async: true})
        // P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.hadwYXNza2V5xQUX9t85TRKuhXgYuQcKY-B0j2RHnbeNs0mvn-dv87ZbwsDIRKJyjAO-NgtnjxuvllHXZ2JXNhxf7Z-sxGn32RStK31givZO2aSM69JdQIvH0W1OXF_Zv7iUgkWngbbHxZ014DNmxz40nHi3GF3y1lYq7yVZrQPID_hWBmHxq36fIcAil3Mvx8844cIVxyA4Bb_FznyetYYrZNooRP7LrK8_kfHWgVI69mvPQuIssgDPngUw2M9lME6s294hSTfaC_GRh9enuLDRibaoOL1Z0voNxcyfLqEJ7MhQ1MlSzWWWWP1w4TjmWgah4wvY2Eel_UuvAujzWJoZ2gFuQ400AMcTSDCOzkQ4NACnMRTnP5MebcM8MAiE8sLfLUVomtPtUG-BmK_68FcrOCtt4vOgQXJKN3U9ywMvIK7G4bmpK_UtJlPtHG4dewJZfNf7odFi68JnwRHQD1jXxw1qebKi7537nza5uEY62aZ9uO-bx92HMJsfxNBzLj4b5GVvd_9CCAeE2BOScwm48pLHcylF1N291DVCfH4rTHOG8kpOhGfU0HiE9GW9g408y-kiqwe7sAk1ex4udtAGhp8P1PjHOm4Bg9PwFtFPuAObXmJ6C6zZyOXnVlnfOorLv5JTPSED5aR2p0FeCBVUUowQ8_aYvIBCA9Sc3sLybKlE_Gk8NDI-zMl1FFeanky_EG1KSldviAF2iVnXbhFHWN_AcwgdZ7lwbiSt9nHhtFdlSIDmL65FPhPiNN20x2qlXX7bm0vjiwWLC3wKRl9izU7s141EcT3F2m1XHs8JfX-Wglob71oVtauqiIfkXdtrVtam5vLwz9PtR5Iom5ZbaiFzHc5zTyyZedd9ep_NARAKcTFwGVq8po8Lt3N6iHoJi14_zOj5rrUpVZbHTXHRHG8rdwgC7CBpc8kYYSln2gBrZkeOWtKX5CQOHCKT7CnBVzZ17QDGzgl0WocMYFRx8ToLZAVXfOvo8BgcBDNo3rxaCxGQ4iO-Ox8Vj-758Xev2TaMgyNkhyLyQqWDVsna6syaZTZ0OD66lLO4GQBeXJ4TJVxkjy16Ug8-igNuEfweilDUcuZotDBXP7ENuSUXSxsmsmj9Wh0lUqbU2l9uHfLWPIX8QGoeIGfZCu434t9klpUigpKoJu7JrKmvPv7OzEqGuGR2w16gIl97CHqXay547Ka13ju0Xd1eLR6L17pbEC5k_NMglnT289B_2GL4mhpTyW0vsRh6J6Yf7prUQbob71jA0JBYd8_V98oI-9ZbgNV80kU1ZypwleebTXthpIHK9RokKPpueA1p7ulVljanQEejX-yWl5NN4r19VK09FFinTK5HBAMfsZsYRoGPjOPfcatA1A8yzwq0kOqM_Q4m5ENApMx6vOz7LssL-dt021pnfB0Fw-wgBInYpgcS6LiVuL9A7JnP-b90Y6wLJum-ScD2rdEe_WVXe0evH_F-MgaytJASPbPF01zTmoVZk9yxvbX-iXuV5DjHkT5YTOiRB0-VvXcDJ-r6N-nrcQWMNLX_NcBUNhCk0qwcXtA5MYf3_TLc-F0KIRGFY4ZgYNFwhS-gQGQ6XG7S8jMCOK8SX2hDdrYmQIZlkSeg6S2A0m3MbCooZBpIDKOwBD7zwrl_67i9XeGp7l-W7YI6B9Vxov5xGewe1c-Mum0k1wpGgzU11WbMdSAWf7YZMHKa1MFyDnSq6Gdgar8FdHZ8Dh7ih_8mfwSMIjKQ4MpIoNqIjaNleHDOZ7aRBahzaGFyZF9pZM4xrUyBomtyqDI5YjM3NDA0onBkAA.8yalamj04n6sgH99PmI4Ak7mXdAew2bP50Ct3Oo014E
        // NOPE doesn't work for some reason when opening with puppeteer. Probably looks too suspicious

        // const captcha_token = await this.page.evaluate(() => {
        //     return new Promise<string>(async (resolve, reject) => {
        //         const hcaptcha = (window as any).hcaptcha;
                
        //         if (hcaptcha) {
        //             try {
        //                 // TODO .. seems to hang
        //                 // this is due to an actual hcaptcha being required
        //                 const captcha = await hcaptcha.execute({ async: true })
        //                 resolve(captcha.response);
        //                 // hcaptcha.execute();
        //                 // resolve('OK');
        //             } catch(err) {
        //                 reject(err);
        //             }
        //         } else {
        //             reject('Failed to find hcaptcha');
        //         }
        //     });
        // });

        // NOTE looks like there's a honeypot of some sort https://suno.com/suno-prod-s8wir/58sj3ae84cd6
        // Could be regional though. IP based? Unsure but doesn't seem to be affecting anything atm

        // NOTE would it make any sense to actually generate the song inside the `browser` vs here on the server?
        // Probably not if it works like this as-is

        const solver = new Solver(this.env.TWOCAPTCHA_API_KEY);

        const { data: captcha_token } = await solver.hcaptcha({
            pageurl: this.page.url(),
            sitekey: this.sitekey,
            userAgent: this.env.USER_AGENT
        })

        console.log('CAPTCHA_TOKEN', captcha_token);

        await this.env.KV.put('CAPTCHA_TOKEN', captcha_token);

        return captcha_token;
    }
}