import { IttyRouter, cors, withParams, status, error } from 'itty-router'
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
    .all('*', () => status(404))

const handler = {
    fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
        router
            .fetch(req, env, ctx)
            .catch((err: any) => {
                console.error(err);
                return error(err?.status ?? 400, err)
            })
            .then((res: Response) => corsify(res, req)),
    
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
        const doid = env.DURABLE_OBJECT.idFromName('v0.0.0');
        const stub = env.DURABLE_OBJECT.get(doid);
        
        await stub.getTokens();
    }
} satisfies ExportedHandler<Env>;

export default { ...handler }