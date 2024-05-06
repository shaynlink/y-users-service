import type {
  PostInterface,
  PostModel,
  PostInstanceMethods,
  PostQueryHelpers,
  PostVirtuals,
  PostStaticMethods,
  PostSchema as IPostSchema,
  UserInterface,
  UserModel,
  UserInstanceMethods,
  UserQueryHelpers,
  UserVirtuals,
  UserStaticMethods,
  UserSchema as IUserSchema,
  FollowInjuctionInterface,
  FollowInjuctionInstanceMethods,
  FollowInjuctionModel,
  FollowInjuctionQueryHelpers,
  FollowInjuctionStaticMethods,
  FollowInjuctionVirtuals,
  FollowInjuctionSchema as IFollowInjuctionSchema,
  FeedInterface,
  FeedInstanceMethods,
  FeedModel,
  FeedQueryHelpers,
  FeedStaticMethods,
  FeedVirtuals,
  FeedSchema as IFeedSchema
} from './schema';
import { Schema, model } from 'mongoose';

export const PostSchema: IPostSchema = new Schema<
  PostInterface,
  PostModel,
  PostInstanceMethods,
  PostQueryHelpers,
  PostVirtuals,
  PostStaticMethods
>({
  user: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Users'
  },
  ref: {
    type: Schema.Types.ObjectId,
    required: false,
    ref: 'Posts',
    default: null
  },
  content: {
    type: String,
    required: true,
  },
  images: {
    type: [String],
    required: false,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  likes: {
    type: [Schema.Types.ObjectId],
    required: false,
    default: []
  },
}
  , {
  methods: {
    like(target: Schema.Types.ObjectId) {
      return this.updateOne({
        $push: {
          likes: target
        }
      })
    },
    unlike(target: Schema.Types.ObjectId) {
      return this.updateOne({
        $pull: {
          likes: target
        }
      })
    }
  }
})

export const UserSchema: IUserSchema = new Schema<
  UserInterface,
  UserModel,
  UserInstanceMethods,
  UserQueryHelpers,
  UserVirtuals,
  UserStaticMethods
>({
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: (email: string) => {
        return /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,6}$/.test(email)
      },
      message: (props: { value: string }) => `${props.value} is not a valid email`
    }
  },
  picture: {
    type: String,
    required: false
  },
  password: {
    type: String,
    required: true,
    validate: {
      validator: (password: string) => {
        return password.length >= 8 && password.length <= 64
      },
      message: () => `Is not a valid password`
    }
  },
  role: {
    type: String,
    required: true,
    default: 'user',
    enum: ['user', 'admin']
  }
}, {
  methods: {
    follow(target: Schema.Types.ObjectId) {
      const FollowInjuction = model<FollowInjuctionModel>('FollowInjuctions');
      return new FollowInjuction({
        target: this._id,
        source: target
      }).save()
    },
    unfollow(target: Schema.Types.ObjectId) {
      const FollowInjuction = model<FollowInjuctionModel>('FollowInjuctions');
      return FollowInjuction.deleteOne({
        target: target,
        source: this._id
      })
    }
  }
})

export const FollowInjuctionSchema: IFollowInjuctionSchema = new Schema<
  FollowInjuctionInterface,
  FollowInjuctionModel,
  FollowInjuctionInstanceMethods,
  FollowInjuctionQueryHelpers,
  FollowInjuctionVirtuals,
  FollowInjuctionStaticMethods
>({
  target: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Users'
  },
  source: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Users'
  }
})

export const FeedSchema: IFeedSchema = new Schema<
  FeedInterface,
  FeedModel,
  FeedInstanceMethods,
  FeedQueryHelpers,
  FeedVirtuals,
  FeedStaticMethods
>({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Users'
  },
  fromIds: {
    type: [Schema.Types.ObjectId],
    required: true,
    default: []
  }
})