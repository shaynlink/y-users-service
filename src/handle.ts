import { ErrorResponse, HTTPHandle, Route } from 'codebase'
import { UserModel, FollowInjuctionModel } from './schema'
import pkg from '../package.json'
import axios from 'axios'
import { AuthorizationVerifyResponse } from 'y-types/service'
import { Types, isValidObjectId } from 'mongoose'
import multer from 'multer'
import { Storage } from '@google-cloud/storage'
import { v4 } from 'uuid'
import { format } from 'node:util'

export function setUpHandle(handle: HTTPHandle) {
  handle.initiateHealthCheckRoute(pkg.version);

  const User: UserModel = handle.app.locals.schema.User;
  const FollowInjuction: FollowInjuctionModel = handle.app.locals.schema.FollowInjuction;

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
          throw new Error('Unable to verify user');
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
            .exec();

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
            ...userDoc.toObject(),
            following,
            followers
          }

          return handle.createResponse(req, res, user, null);
        } catch (error) {
          console.error(error);
          return handle.createResponse(req, res, null, new ErrorResponse('Unable to get user', 500));
        }
      })
      .post(async (req, res) => {
        try {
          const user = await User
            .findById(res.locals.userId)
            .select({ _id: 1, username: 1, email: 1, picture: 1 })
            .exec();

          if (!user) {
            return handle.createResponse(req, res, null, new ErrorResponse('User not found', 404));
          }


          if (req.body.username) {
            user.username = req.body.username
          }

          if (req.body.email) {
            user.email = req.body.email;
          }

          const error = user.validateSync();

          if (error) {
            return handle.createResponse(req, res, null, new ErrorResponse('Invalid fields', 400, error.errors));
          }

          await user.save({
            validateBeforeSave: true
          })

          return handle.createResponse(req, res, user, null);
        } catch (error: any) {
          console.error(error);
          if (error?.code === 11000) {
            return handle.createResponse(req, res, null,
              new ErrorResponse(
                `Fields already used`,
                400,
                {
                  code: 11000,
                  keyPattern: error.keyPattern
                }
              )
            )
          }
          return handle.createResponse(req, res, null, new ErrorResponse('Unable to modify user', 500));
        }
      })

    const storage = new Storage();

    const uploadHandler = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024
      }
    });

    if (!process.env.GCLOUD_STORAGE_BUCKET) {
      throw new Error('Missing google cloud storage bucket');
    }

    const bucket = storage.bucket(process.env.GCLOUD_STORAGE_BUCKET);

    route.mapper.post(
      '/me/picture',
      uploadHandler.single('file'),
      async (req, res, next) => {
        if (!req.file) {
          return handle.createResponse(req, res, null, new ErrorResponse('Missing files', 400));
        }

        const user = await User
        .findById(res.locals.userId)
        .exec();

        if (!user) {
          return handle.createResponse(req, res, null, new ErrorResponse('User not found', 404));
        }

        const discriminator = v4();
        
        let ext = req.file.originalname.split('.').pop();
        
        if (!ext) {
          switch (req.file.mimetype) {
            case 'image/jpeg':
              ext = 'jpeg';
              break;
            case 'image/png':
              ext = 'png';
              break;
            case 'image/gif':
              ext = 'gif';
              break;
            case 'image/webp':
              ext = 'webp';
              break;
            default:
              return handle.createResponse(req, res, null, new ErrorResponse('Unsupported file type', 400));
          }
        }

        const fileName = `${discriminator}.${ext}`

        const blob = bucket.file(`${user._id}/${fileName}`);
        const blobStream = blob.createWriteStream();

        blobStream.on('error', (error) => {
          next(error);
        });

        blobStream.on('finish', async () => {
          const publicUrl = format(
            `https://storage.googleapis.com/${bucket.name}/${blob.name}`
          );

          user.picture = fileName;
          await user.save();

          return handle.createResponse(req, res, { url: publicUrl }, null);
        });

        blobStream.end(req.file.buffer);
      },
      // Error handler
      async (req, res) => {
        return handle.createResponse(req, res, null, new ErrorResponse('Unable to upload picture', 500));
      })

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
          .exec();

        const users = await User
          .find({ _id: { $in: followInjuctions.map(({ target }) => target) } })
          .select({ _id: 1, username: 1 })
          .exec();

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
          .exec();

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
          .exec();

        if (!userDoc) {
          return handle.createResponse(req, res, null, new ErrorResponse('User not found', 404));
        }

        const following = await FollowInjuction
          .countDocuments({ source: userDoc._id })
          .exec();
        
        const followers = await FollowInjuction
          .countDocuments({ target: userDoc._id })
          .exec();

        const user = {
          ...userDoc,
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

        const users = await User
          .find({ _id: { $in: followInjuctions.map(({ target }) => target) } })
          .select({ _id: 1, username: 1 })
          .exec();

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
          .exec();

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
            .exec();

          if (!user) {
            return handle.createResponse(req, res, null, new ErrorResponse('User not found', 404));
          }

          const followInjuction = await FollowInjuction
            .findOne({ source: res.locals.userId, target: id })
            .exec();
          
          if (!followInjuction) {
            await user.follow(res.locals.userId);
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
            .exec();

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