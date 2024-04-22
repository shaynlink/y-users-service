import HTTPHandle, { ErrorResponse } from 'codebase/src/HTTPHandle'
import Route from 'codebase/src/Route';

export function setUpHandle(handle: HTTPHandle) {
  handle.initiateHealthCheckRoute();
  handle.createRoute('/', (route: Route) => {
    // Set middleware for each route endpoints
    route.setGlobalMiddleware('(/) logger', (req, res, next) => {
      console.log('Middleware for /');
      next();
    })

    // Creare a new middleware
    const authentification = route.createMiddleware('(/) authentification', (req, res, next) => {
      if (req.headers.authorization !== 'Bearer token') {
        return res.status(200).send(handle.createResponse(req, res, null, new ErrorResponse('Unauthorized', 403)));
      }

      res.locals.user = {
        id: 1,
        name: 'Shaynlink'
      }
      next();
    })

    route.mapper.use(authentification);

    route.mapper.get(
      '/',
      authentification,
      (req, res) => {
        return handle.createResponse(req, res, {
          message: 'Hello ' + res.locals.user.name
        }, null);
      });
  })
}