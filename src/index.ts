import { IttyRouter, text, cors, withParams, json, status, error } from 'itty-router'
import { lyrics } from './api/lyrics';
import { getSongs, postSongs } from './api/songs';

export { DO } from "./do";

const { preflight, corsify } = cors()
const router = IttyRouter()

router
    .options('*', preflight)
    .all('*', withParams)
    .post('/api/lyrics', lyrics)
    .get('/api/songs', getSongs)
    .post('/api/songs', postSongs)
    // .get('/', async (req: Request, env: Env, ctx: ExecutionContext) => {
    //     const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
    //     const stub = env.DURABLE_OBJECT.get(doid);
    //     const token = await stub.getToken();

    //     return text(token);
    // })
    // .get('/api/get', get)
    // .post('/api/lyrics', lyrics)
    // .post('/api/generate', generate)
    .all('*', () => status(404))

const handler = {
    fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
        router
            .fetch(req, env, ctx)
            .catch(error)
            .then((res: Response) => corsify(res, req)),
    
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
        const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
        const stub = env.DURABLE_OBJECT.get(doid);
        const token = await stub.getToken();
    }
} satisfies ExportedHandler<Env>;

export default { ...handler }