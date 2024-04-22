import 'dotenv/config'
import Core from 'codebase/src/index';
import { setUpHandle } from './handle';

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

  await core.DBService.createClient();

  const handle = core.HTTPService.handle;

  setUpHandle(handle);

  const server = core.HTTPService.createServer();

  server.on('connection', (socket) => {
    console.log('New connection from %s', socket.remoteAddress);
  })
}

bootstrap();