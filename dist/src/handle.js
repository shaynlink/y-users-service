"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUpHandle = void 0;
const codebase_1 = require("codebase");
const package_json_1 = __importDefault(require("../package.json"));
const axios_1 = __importDefault(require("axios"));
const mongoose_1 = require("mongoose");
function setUpHandle(handle) {
    handle.initiateHealthCheckRoute(package_json_1.default.version);
    const User = handle.app.locals.schema.User;
    const FollowInjuction = handle.app.locals.schema.FollowInjuction;
    handle.createRoute('/', (route) => {
        route.setGlobalMiddleware('Verify jwt token', async (req, res, next) => {
            try {
                if (!req.headers.authorization) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing authorization', 401));
                }
                const [type, token] = req.headers.authorization.split(' ');
                if (type !== 'Bearer') {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized token type', 401));
                }
                if (!token) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing token', 401));
                }
                const response = await axios_1.default.post('https://authorization-service-2fqcvdzp6q-ew.a.run.app', {
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
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Authorization service unable verify token', 500));
                }
                const { valide, decoded } = response.data.result;
                if (!valide) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized token', 401));
                }
                res.locals.authorization = decoded;
                next();
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to verify token', 500));
            }
        });
        route.setGlobalMiddleware('Verify audience authorization', (req, res, next) => {
            const { aud } = res.locals.authorization;
            const [platform, location, target] = aud.split(':');
            if (platform != 'y') {
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized audience platform', 401));
            }
            if (location !== 'services' && location !== '*') {
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized audience location', 401));
            }
            if (target !== 'users' && target !== '*') {
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized audience target', 401));
            }
            next();
        });
        route.setGlobalMiddleware('Verify subject authorization', async (req, res, next) => {
            const { sub } = res.locals.authorization;
            const [platform, location, id] = sub.split(':');
            if (platform != 'y') {
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized subject platform', 401));
            }
            if (location !== 'users' && location !== '*') {
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized subject location', 401));
            }
            if (!id) {
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized subject id', 401));
            }
            if (!(0, mongoose_1.isValidObjectId)(id)) {
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Invalid subject id', 401));
            }
            res.locals.userId = mongoose_1.Types.ObjectId.createFromHexString(id);
            next();
        });
        route.mapper.get('/me', async (req, res) => {
            try {
                const user = await User
                    .findById(res.locals.userId)
                    .select({ _id: 1, username: 1, email: 1 })
                    .exec();
                return handle.createResponse(req, res, user, null);
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to get user', 500));
            }
        });
        route.mapper.get('/me/following', async (req, res) => {
            try {
                if (!req.query.limit) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query limit', 400));
                }
                if (!req.query.page) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query page', 400));
                }
                const skip = parseInt(req.query.page) * parseInt(req.query.limit);
                const followInjuctions = await FollowInjuction
                    .find({ source: res.locals.userId })
                    .select({ target: 1 })
                    .skip(skip)
                    .limit(parseInt(req.query.limit))
                    .exec();
                const users = await User
                    .find({ _id: { $in: followInjuctions.map(({ target }) => target) } })
                    .select({ _id: 1, username: 1 })
                    .exec();
                return handle.createResponse(req, res, users, null);
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to get following users', 500));
            }
        });
        route.mapper.get('/me/followers', async (req, res) => {
            try {
                if (!req.query.limit) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query limit', 400));
                }
                if (!req.query.page) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query page', 400));
                }
                const skip = parseInt(req.query.page) * parseInt(req.query.limit);
                const followInjuctions = await FollowInjuction
                    .find({ target: res.locals.userId })
                    .select({ source: 1 })
                    .skip(skip)
                    .limit(parseInt(req.query.limit))
                    .exec();
                const users = await User
                    .find({ _id: { $in: followInjuctions.map(({ source }) => source) } })
                    .select({ _id: 1, username: 1 })
                    .exec();
                return handle.createResponse(req, res, users, null);
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to get followers users', 500));
            }
        });
        route.mapper.get('/:id', async (req, res) => {
            try {
                if (!req.params.id) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unauthorized subject id', 401));
                }
                if (!(0, mongoose_1.isValidObjectId)(req.params.id)) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Invalid subject id', 401));
                }
                const id = mongoose_1.Types.ObjectId.createFromHexString(req.params.id);
                const user = await User
                    .findById(id)
                    .select({ _id: 1, username: 1 })
                    .exec();
                return handle.createResponse(req, res, user, null);
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to get user', 500));
            }
        });
        route.mapper.get('/:id/following', async (req, res) => {
            try {
                if (!req.params.id) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing params id', 400));
                }
                if (!(0, mongoose_1.isValidObjectId)(req.params.id)) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Invalid params id', 401));
                }
                const id = mongoose_1.Types.ObjectId.createFromHexString(req.params.id);
                if (!req.query.limit) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query limit', 400));
                }
                if (!req.query.page) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query page', 400));
                }
                const skip = parseInt(req.query.page) * parseInt(req.query.limit);
                const followInjuctions = await FollowInjuction
                    .find({ source: id })
                    .select({ target: 1 })
                    .skip(skip)
                    .limit(parseInt(req.query.limit))
                    .exec();
                const users = await User
                    .find({ _id: { $in: followInjuctions.map(({ target }) => target) } })
                    .select({ _id: 1, username: 1 })
                    .exec();
                return handle.createResponse(req, res, users, null);
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to get following users', 500));
            }
        });
        route.mapper.get('/:id/followers', async (req, res) => {
            try {
                if (!req.params.id) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing params id', 400));
                }
                if (!(0, mongoose_1.isValidObjectId)(req.params.id)) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Invalid params id', 401));
                }
                const id = mongoose_1.Types.ObjectId.createFromHexString(req.params.id);
                if (!req.query.limit) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query limit', 400));
                }
                if (!req.query.page) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing query page', 400));
                }
                const skip = parseInt(req.query.page) * parseInt(req.query.limit);
                const followInjuctions = await FollowInjuction
                    .find({ target: id })
                    .select({ source: 1 })
                    .skip(skip)
                    .limit(parseInt(req.query.limit))
                    .exec();
                const users = await User
                    .find({ _id: { $in: followInjuctions.map(({ source }) => source) } })
                    .select({ _id: 1, username: 1 })
                    .exec();
                return handle.createResponse(req, res, users, null);
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to get followers users', 500));
            }
        });
        route.mapper.route('/:id/follow')
            .put(async (req, res) => {
            try {
                if (!req.params.id) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing params id', 401));
                }
                if (!(0, mongoose_1.isValidObjectId)(req.params.id)) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Invalid params id', 401));
                }
                const id = mongoose_1.Types.ObjectId.createFromHexString(req.params.id);
                if (id.equals(res.locals.userId)) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to follow yourself', 400));
                }
                const user = await User
                    .exists({ _id: id })
                    .exec();
                if (!user) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('User not found', 404));
                }
                const followInjuction = await FollowInjuction
                    .findOne({ source: res.locals.userId, target: id })
                    .exec();
                if (!followInjuction) {
                    await new FollowInjuction({ source: res.locals.userId, target: id }).save();
                    return res.status(204).end();
                }
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Already following user', 400));
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to follow user', 500));
            }
        })
            .delete(async (req, res) => {
            try {
                if (!req.params.id) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Missing params id', 401));
                }
                if (!(0, mongoose_1.isValidObjectId)(req.params.id)) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Invalid params id', 401));
                }
                const id = mongoose_1.Types.ObjectId.createFromHexString(req.params.id);
                if (id.equals(res.locals.userId)) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to unfollow yourself', 400));
                }
                const user = await User
                    .exists({ _id: id })
                    .exec();
                if (!user) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('User not found', 404));
                }
                const followInjuction = await FollowInjuction
                    .findOne({ source: res.locals.userId, target: id })
                    .select({ _id: 1 })
                    .exec();
                if (!followInjuction) {
                    return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Not following user', 400));
                }
                await FollowInjuction.deleteOne({ _id: followInjuction._id });
                return res.status(204).end();
            }
            catch (error) {
                console.error(error);
                return handle.createResponse(req, res, null, new codebase_1.ErrorResponse('Unable to unfollow user', 500));
            }
        });
    });
    handle.initiateNotFoundRoute();
}
exports.setUpHandle = setUpHandle;
