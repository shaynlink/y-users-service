import type {
  Schema,
  Model,
  HydratedDocument,
  DefaultSchemaOptions,
  Types,
  QueryWithHelpers
} from 'mongoose';

// ---- POST ----

export interface PostInterface {
  user: Types.ObjectId;
  ref: Types.ObjectId;
  content: string;
  images: string[];
  timestamp: Date;
  likes: Types.ObjectId[];
}

export interface PostQueryHelpers {}

export interface PostInstanceMethods {
  like(target: Schema.Types.ObjectId): Promise<Query<any, this>>;
  unlike(target: Schema.Types.ObjectId): Promise<Query<any, this>>;
}

export interface PostVirtuals {}

export type PostHydratedDocument = HydratedDocument<PostInterface, PostVirtuals & PostInstanceMethods, PostQueryHelpers>;

export type PostModel = Model<
  PostInterface,
  PostQueryHelpers,
  PostInstanceMethods,
  PostVirtuals,
  PostHydratedDocument,
  PostSchema
>;

export interface PostStaticMethods {}

export type PostSchemaOptions = DefaultSchemaOptions;

export type PostSchema = Schema<
  PostInterface,
  PostModel,
  PostInstanceMethods,
  PostQueryHelpers,
  PostVirtuals,
  PostStaticMethods
>;

// ---- USER ----

export interface UserInterface {
  username: string;
  email: string;
  picture: string;
  password: string;
  role: 'user' | 'admin';
}

export interface UserQueryHelpers {}

export interface UserInstanceMethods {
  follow(target: Schema.Types.ObjectId): Promise<any>;
  unfollow(target: Schema.Types.ObjectId): Promise<any>;
}

export interface UserVirtuals {}

export type UserHydratedDocument = HydratedDocument<UserInterface, UserVirtuals & UserInstanceMethods, UserQueryHelpers>;

export type UserModel = Model<
  UserInterface,
  UserQueryHelpers,
  UserInstanceMethods,
  UserVirtuals,
  UserHydratedDocument,
  UserSchema
>;

export interface UserStaticMethods {}

export type UserSchemaOptions = DefaultSchemaOptions;

export type UserSchema = Schema<
  UserInterface,
  UserModel,
  UserInstanceMethods,
  UserQueryHelpers,
  UserVirtuals,
  UserStaticMethods
>;

// ---- FOLLOW INJUCTION ----

export interface FollowInjuctionInterface {
  target: Types.ObjectId;
  source: Types.ObjectId;
}

export interface FollowInjuctionQueryHelpers {}

export interface FollowInjuctionInstanceMethods {}

export interface FollowInjuctionVirtuals {}

export type FollowInjuctionHydratedDocument = HydratedDocument<
  FollowInjuctionInterface,
  FollowInjuctionVirtuals & FollowInjuctionInstanceMethods,
  FollowInjuctionQueryHelpers>;

export type FollowInjuctionModel = Model<
  FollowInjuctionInterface,
  FollowInjuctionQueryHelpers,
  FollowInjuctionInstanceMethods,
  FollowInjuctionVirtuals,
  FollowInjuctionHydratedDocument,
  FollowInjuctionSchema
>;

export interface FollowInjuctionStaticMethods {}

export type FollowInjuctionSchemaOptions = DefaultSchemaOptions;

export type FollowInjuctionSchema = Schema<
  FollowInjuctionInterface,
  FollowInjuctionModel,
  FollowInjuctionInstanceMethods,
  FollowInjuctionQueryHelpers,
  FollowInjuctionVirtuals,
  FollowInjuctionStaticMethods
>;

// ---- FEED ----

export interface FeedInterface {
  userId: Types.ObjectId;
  fromIds: Types.ObjectId[];
}

export interface FeedQueryHelpers {}

export interface FeedInstanceMethods {}

export interface FeedVirtuals {}

export type FeedHydratedDocument = HydratedDocument<
  FeedInterface,
  FeedVirtuals & FeedInstanceMethods,
  FeedQueryHelpers>;

export type FeedModel = Model<
  FeedInterface,
  FeedQueryHelpers,
  FeedInstanceMethods,
  FeedVirtuals,
  FeedHydratedDocument,
  FeedSchema
>;

export interface FeedStaticMethods {}

export type FeedSchemaOptions = DefaultSchemaOptions;

export type FeedSchema = Schema<
  FeedInterface,
  FeedModel,
  FeedInstanceMethods,
  FeedQueryHelpers,
  FeedVirtuals,
  FeedStaticMethods
>;