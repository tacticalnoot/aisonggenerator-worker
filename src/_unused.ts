// without captcha
// TODO not sure this would ever be needed. Either it works up front or a captcha is required
// else if (
//     method === 'POST'
//     && url.includes('/api/generate/v2/')
// ) {
//     try {
//         console.log('Intercepted request to /api/generate/v2/');

//         await request.abort();

//         const headers = request.headers();
//         const authorization = headers.authorization;
//         const current_token = authorization.split(' ')[1];

//         const gpt_description_prompt = await page.$eval('.custom-textarea', (el) => el.getAttribute('placeholder'));

//         if (!gpt_description_prompt) {
//             throw new Error('Failed to get gpt_description_prompt');
//         }

//         const generateResponse = await sunoGenerate(client, gpt_description_prompt, null, current_token);
//         console.log(JSON.stringify(generateResponse.data, null, 2));

//         resolve(await page.screenshot());
//     } catch (err) {
//         reject(err);
//     }
// }