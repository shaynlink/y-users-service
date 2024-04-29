import { ErrorResponse, HTTPHandle, Route } from 'codebase'
import type { Model, ObjectId } from 'mongoose'
import { FollowInjuctionSchema, IUser, UserSchema } from './shemas'
import pkg from '../package.json'
import axios from 'axios'
import { AuthorizationVerifyResponse } from 'y-types/service'
import { Types, isValidObjectId } from 'mongoose'

export function setUpHandle(handle: HTTPHandle) {
  handle.initiateHealthCheckRoute(pkg.version);

  const User: Model<IUser> = handle.app.locals.schema.User;
  const FollowInjuction: Model<typeof FollowInjuctionSchema> = handle.app.locals.schema.FollowInjuction;

  handle.createRoute('/',(route: Route) => {
    route.setGlobalMiddleware('Verify jwt token', async (req, res, next) => {
      try {
        if (!req.headers.authorization) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing authorization', 401));
        }
  
        const [type, token] = req.headers.authorization.split(' ');

        if (type !== 'Bearer') {
          return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized token type', 401));
        }
  
        if (!token) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing token', 401));
        }
  
        const response = await axios.post<AuthorizationVerifyResponse>('https://authorization-service-2fqcvdzp6q-ew.a.run.app', {
          type: 'verify',
          token
        })
          .catch((e) => e.response);

        if (response.status !== 200) {
          throw new Error('Unable to create user');
        }

        if (response.data.error) {
          return new Error(response.data.error.message);
        }

        if (!response.data.result) {
          return handle.createResponse(req, res, null, new ErrorResponse('Authorization service unable verify token', 500));
        }

        const {valide, decoded} = response.data.result;

        if (!valide) {
          return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized token', 401));
        }

        res.locals.authorization = decoded;

        next();
      } catch (error) {
        console.error(error);

        return handle.createResponse(req, res, null, new ErrorResponse('Unable to verify token', 500));
      }
    })

    route.setGlobalMiddleware('Verify audience authorization', (req, res, next) => {
      const { aud } = res.locals.authorization;

      const [platform, location, target] = aud.split(':');

      if (platform != 'y') {
        return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized audience platform', 401));
      }

      if (location !== 'services' && location !== '*') {
        return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized audience location', 401));
      }

      if (target !== 'users' && target !== '*') {
        return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized audience target', 401));
      }

      next();
    })

    route.setGlobalMiddleware('Verify subject authorization', async (req, res, next) => {
      const { sub } = res.locals.authorization;

      const [platform, location, id] = sub.split(':');

      if (platform != 'y') {
        return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized subject platform', 401));
      }

      if (location !== 'users' && location !== '*') {
        return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized subject location', 401));
      }

      if (!id) {
        return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized subject id', 401));
      }

      if (!isValidObjectId(id)) {
        return handle.createResponse(req, res, null, new ErrorResponse('Invalid subject id', 401));
      }

      res.locals.userId = Types.ObjectId.createFromHexString(id);

      next();
    })

    route.mapper.route('/me')
      .get(async (req, res) => {
      try {
        const userDoc = await User
          .findById(res.locals.userId)
          .select({ _id: 1, username: 1, email: 1 })
          .exec() as unknown as typeof UserSchema & { _doc: IUser };

        if (!userDoc) {
          return handle.createResponse(req, res, null, new ErrorResponse('User not found', 404));
        }

        const following = await FollowInjuction
          .countDocuments({ source: res.locals.userId })
          .exec();
        
        const followers = await FollowInjuction
          .countDocuments({ target: res.locals.userId })
          .exec();

        const user = {
          ...userDoc._doc,
          following,
          followers
        }

        return handle.createResponse(req, res, user, null);
      } catch (error) {
        console.error(error);
        return handle.createResponse(req, res, null, new ErrorResponse('Unable to get user', 500));
      }
      });

    route.mapper.get('/me/following', async (req, res) => {
      try {
        if (!req.query.limit) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query limit', 400));
        }

        if (!req.query.page) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query page', 400));
        }

        const skip = parseInt(req.query.page as string) - 1 * parseInt(req.query.limit as string);

        const followInjuctions = await FollowInjuction
          .find({ source: res.locals.userId })
          .select({ _id: 1, target: 1 })
          .skip(skip)
          .limit(parseInt(req.query.limit as string))
          .exec() as unknown as typeof FollowInjuctionSchema & { target: Types.ObjectId }[];

        const users = await User
          .find({ _id: { $in: followInjuctions.map(({ target }) => target) } })
          .select({ _id: 1, username: 1 })
          .exec() as unknown as typeof UserSchema[];

        return handle.createResponse(req, res, users, null);
      } catch (error) {
        console.error(error);
        return handle.createResponse(req, res, null, new ErrorResponse('Unable to get following users', 500));
      }
    })

    route.mapper.get('/me/followers', async (req, res) => {
      try {
        if (!req.query.limit) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query limit', 400));
        }

        if (!req.query.page) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query page', 400));
        }

        const skip = parseInt(req.query.page as string) - 1 * parseInt(req.query.limit as string);

        const followInjuctions = await FollowInjuction
          .find({ target: res.locals.userId })
          .select({ source: 1 })
          .skip(skip)
          .limit(parseInt(req.query.limit as string))
          .exec() as unknown as { source: Types.ObjectId }[];

        const users = await User
          .find({ _id: { $in: followInjuctions.map(({ source }) => source) } })
          .select({ _id: 1, username: 1 })
          .exec() as unknown as typeof UserSchema[];

        return handle.createResponse(req, res, users, null);
      } catch (error) {
        console.error(error);
        return handle.createResponse(req, res, null, new ErrorResponse('Unable to get followers users', 500));
      }
    })

    route.mapper.get('/:id', async (req, res) => {
      try {
        if (!req.params.id) {
          return handle.createResponse(req, res, null, new ErrorResponse('Unauthorized subject id', 401));
        }
  
        if (!isValidObjectId(req.params.id)) {
          return handle.createResponse(req, res, null, new ErrorResponse('Invalid subject id', 401));
        }

        const id = Types.ObjectId.createFromHexString(req.params.id);

        const userDoc = await User
          .findById(id)
          .select({ _id: 1, username: 1 })
          .exec() as unknown as typeof UserSchema & { _doc: IUser & { _id: ObjectId } };

        const following = await FollowInjuction
          .countDocuments({ source: userDoc._doc._id })
          .exec();
        
        const followers = await FollowInjuction
          .countDocuments({ target: userDoc._doc._id })
          .exec();

        const user = {
          ...userDoc._doc,
          following,
          followers
        }

        return handle.createResponse(req, res, user, null);
      } catch (error) {
        console.error(error);
        return handle.createResponse(req, res, null, new ErrorResponse('Unable to get user', 500));
      }
    })

    route.mapper.get('/:id/following', async (req, res) => {
      try {
        if (!req.params.id) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing params id', 400));
        }

        if (!isValidObjectId(req.params.id)) {
          return handle.createResponse(req, res, null, new ErrorResponse('Invalid params id', 401));
        }

        const id = Types.ObjectId.createFromHexString(req.params.id);

        if (!req.query.limit) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query limit', 400));
        }

        if (!req.query.page) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query page', 400));
        }

        const skip = parseInt(req.query.page as string) - 1 * parseInt(req.query.limit as string);

        const followInjuctions = await FollowInjuction
          .find({ source: id })
          .select({ _id: 1, target: 1 })
          .skip(skip)
          .limit(parseInt(req.query.limit as string))
          .exec() as unknown as { target: Types.ObjectId }[];

        console.log(followInjuctions);

        const users = await User
          .find({ _id: { $in: followInjuctions.map(({ target }) => target) } })
          .select({ _id: 1, username: 1 })
          .exec() as unknown as typeof UserSchema[];

        return handle.createResponse(req, res, users, null);
      } catch (error) {
        console.error(error);
        return handle.createResponse(req, res, null, new ErrorResponse('Unable to get following users', 500));
      }
    })

    route.mapper.get('/:id/followers', async (req, res) => {
      try {
        if (!req.params.id) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing params id', 400));
        }

        if (!isValidObjectId(req.params.id)) {
          return handle.createResponse(req, res, null, new ErrorResponse('Invalid params id', 401));
        }

        const id = Types.ObjectId.createFromHexString(req.params.id);

        if (!req.query.limit) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query limit', 400));
        }

        if (!req.query.page) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing query page', 400));
        }

        const skip = parseInt(req.query.page as string) - 1 * parseInt(req.query.limit as string);

        const followInjuctions = await FollowInjuction
          .find({ target: id })
          .select({ source: 1 })
          .skip(skip)
          .limit(parseInt(req.query.limit as string))
          .exec() as unknown as { source: Types.ObjectId }[];

        const users = await User
          .find({ _id: { $in: followInjuctions.map(({ source }) => source) } })
          .select({ _id: 1, username: 1 })
          .exec() as unknown as typeof UserSchema[];

        return handle.createResponse(req, res, users, null);
      } catch (error) {
        console.error(error);
        return handle.createResponse(req, res, null, new ErrorResponse('Unable to get followers users', 500));
      }
    })

    route.mapper.route('/:id/follow')
      .put(async (req, res) => {
        try {
          if (!req.params.id) {
            return handle.createResponse(req, res, null, new ErrorResponse('Missing params id', 401));
          }
    
          if (!isValidObjectId(req.params.id)) {
            return handle.createResponse(req, res, null, new ErrorResponse('Invalid params id', 401));
          }

          const id = Types.ObjectId.createFromHexString(req.params.id);

          if (id.equals(res.locals.userId)) {
            return handle.createResponse(req, res, null, new ErrorResponse('Unable to follow yourself', 400));
          }

          const user = await User
            .findById(id)
            .exec() as unknown as typeof UserSchema & { follow: (userId: Types.ObjectId) => Promise<typeof FollowInjuctionSchema> };

          if (!user) {
            return handle.createResponse(req, res, null, new ErrorResponse('User not found', 404));
          }

          const followInjuction = await FollowInjuction
            .findOne({ source: res.locals.userId, target: id })
            .exec() as unknown as typeof FollowInjuctionSchema;
          
          if (!followInjuction) {
            await user.follow(res.locals.userId) as unknown as typeof FollowInjuctionSchema;
            return res.status(204).end();
          }

          return handle.createResponse(req, res, null, new ErrorResponse('Already following user', 400));
        } catch (error) {
          console.error(error);
          return handle.createResponse(req, res, null, new ErrorResponse('Unable to follow user', 500));
        }
      })
      .delete(async (req, res) => {
        try {
          if (!req.params.id) {
            return handle.createResponse(req, res, null, new ErrorResponse('Missing params id', 401));
          }
    
          if (!isValidObjectId(req.params.id)) {
            return handle.createResponse(req, res, null, new ErrorResponse('Invalid params id', 401));
          }

          const id = Types.ObjectId.createFromHexString(req.params.id);

          if (id.equals(res.locals.userId)) {
            return handle.createResponse(req, res, null, new ErrorResponse('Unable to unfollow yourself', 400));
          }

          const user = await User
            .findById(id)
            .exec() as unknown as typeof UserSchema & { unfollow: (userId: Types.ObjectId) => Promise<void> };

          if (!user) {
            return handle.createResponse(req, res, null, new ErrorResponse('User not found', 404));
          }

          await user.unfollow(res.locals.userId);

          return res.status(204).end();
        } catch (error) {
          console.error(error);
          return handle.createResponse(req, res, null, new ErrorResponse('Unable to unfollow user', 500));
        }
      })
  })

  handle.initiateNotFoundRoute();
}