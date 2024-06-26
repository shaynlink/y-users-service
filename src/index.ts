import 'dotenv/config'
import Core from 'codebase'
import { setUpHandle } from './handle';
import {
  UserSchema,
  FollowInjuctionSchema
} from './schemas';
import type {
  UserSchema as IUserSchema,
  FollowInjuctionSchema as IFollowInjuctionSchema
} from './schema';

const CERTIFICATE_KEY = 'DB_CERTIFICATE';
const CERTIFICATE_DATABASE_NAME = process.env.CERTIFICATE_DATABASE_NAME;

const core = Core.instanciateFromEnv();

async function bootstrap() {
  if (!CERTIFICATE_DATABASE_NAME) {
    throw new Error('Missing certificate database name in env');
  }

  await core.KMService.fetchSecret(
    CERTIFICATE_DATABASE_NAME,
    CERTIFICATE_KEY
  );
  
  core.DBService.getSecretFromKMS(CERTIFICATE_KEY);

  const client = await core.DBService.createClient();

  const User = client.model<IUserSchema>('Users', UserSchema);
  const FollowInjuction = client.model<IFollowInjuctionSchema>('FollowInjuctions', FollowInjuctionSchema);

  const handle = core.HTTPService.handle;
  handle.app.locals.schema = {
    User: User,
    FollowInjuction: FollowInjuction
  }

  setUpHandle(handle);

  const server = core.HTTPService.createServer();

  server.on('connection', (socket) => {
    console.log('New connection from %s', socket.remoteAddress);
  })
}

bootstrap();