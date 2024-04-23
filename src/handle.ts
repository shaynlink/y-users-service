import HTTPHandle, { ErrorResponse } from 'codebase/src/HTTPHandle'
import Route from 'codebase/src/Route';

export function setUpHandle(handle: HTTPHandle) {
  handle.initiateHealthCheckRoute();
  handle.app.locals.users = handle.app.locals.database.collection('users');

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
      '/me',
      authentification,
      async (req, res) => {
        return  handle.createResponse(req, res, await res.locals.users.findOne({ id: res.locals.user.id }), null);
      });

    route.mapper.patch(
      '/me',
      authentification,
      async (req, res) => {
        const user = await res.locals.users.findOne({ id: res.locals.user.id });
        const { name } = req.body;

        if (!name) {
          return handle.createResponse(req, res, null, new ErrorResponse('Name is required', 400));
        }

        user.name = name;
        await res.locals.users.updateOne({ id: res.locals.user.id }, user);

        return handle.createResponse(req, res, { user }, null);
      });

    route.mapper.use(
      authentification,
      async (req, res, next) => {
        await handle.createResponse(req, res, await res.locals.users.findOne({ id: res.locals.user.id }), null);
        next();
      });
    route.mapper.get( 
      '/me/following',
    authentification,
    async (req, res) => {
      return handle.createResponse(req, res, await res.locals.users.findOne({ following: res.locals.user.following }), null);
    });
    
    route.mapper.use(
      authentification,
      async (req, res, next) => {
        await handle.createResponse(req, res, await res.locals.users.findOne({ id: res.locals.user.id }), null);
        next();
      });
    route.mapper.get(
      '/me/followers',
      authentification,
      async (req, res) => {
        return handle.createResponse(req, res, 
          await res.locals.users.findOne({ followers: res.locals.user.followers })
        , null);
      });

    route.mapper.get(
      '/:id',
      authentification,
      async (req, res) => {
        return handle.createResponse(req, res, 
          await res.locals.users.findOne({ id: req.params.id })
        , null);
      });

    route.mapper.get(
      '/:id/following',
      authentification,
      (req, res) => {
        return handle.createResponse(req, res, {
          message: res.locals.users.findOne({ id: req.params.id }).following
        }, null);
      });
    
    route.mapper.get(
      '/:id/followers',
      authentification,
      (req, res) => {
        return handle.createResponse(req, res, {
          message: res.locals.users.findOne({ id: req.params.id }).followers
        }, null);
      });

    route.mapper.put(
      '/:id/follow',
      authentification,
      (req, res) => {
        const user = res.locals.users.findOne({ id: req.params.id });
        const me = res.locals.users.findOne({ id: res.locals.user.id });

        if (user.followers.includes(me.id)) {
          return handle.createResponse(req, res, null, new ErrorResponse('Already following this user', 400));
        }

        user.followers.push(me.id);
        me.following.push(user.id);

        res.locals.users.updateOne({ id: req.params.id }, user);
        res.locals.users.updateOne({ id: res.locals.user.id }, me);

        return handle.createResponse(req, res, null, null);
      });
    
    route.mapper.delete(
      '/:id/follow',
      authentification,
      (req, res) => {
        const user = res.locals.users.findOne({ id: req.params.id });
        const me = res.locals.users.findOne({ id: res.locals.user.id });

        if (!user.followers.includes(me.id)) {
          return handle.createResponse(req, res, null, new ErrorResponse('Not following this user', 400));
        }

        user.followers = user.followers.filter((id: number) => id !== me.id);
        me.following = me.following.filter((id: number) => id !== user.id);

        res.locals.users.updateOne({ id: req.params.id }, user);
        res.locals.users.updateOne({ id: res.locals.user.id }, me);

        return handle.createResponse(req, res, null, null);
      });
  })
}