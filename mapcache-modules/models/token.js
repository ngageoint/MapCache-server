var crypto = require('crypto')
  , mongoose = require('mongoose')
  , config = require('mapcache-config');

// Token expiration in msecs
var tokenExpiration = config.server.token.expiration * 1000;

// Creates a new Mongoose Schema object
var Schema = mongoose.Schema;

// Collection to hold users
var TokenSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    expirationDate: { type: Date, required: true },
    token: { type: String, required: true }
  },{
    versionKey: false
  }
);

TokenSchema.index({'expirationDate': 1}, {expireAfterSeconds: 0});

// Creates the Model for the User Schema
var Token;
if (mongoose.models.Token) {
  Token = mongoose.model('Token');
} else {
  Token = mongoose.model('Token', TokenSchema);
}

exports.getToken = function(token, callback) {
  Token.findOne({token: token}).populate({path: 'userId', options: {lean: true}}).exec(function(err, token) {
    if (!token || !token.userId) {
      return callback(null, null);
    }

    token.userId.populate('roleId', function(err, user) {
      return callback(err, {user: user, token: token});
    });
  });
};

exports.createToken = function(options, callback) {
  var seed = crypto.randomBytes(20);
  var token = crypto.createHash('sha1').update(seed).digest('hex');

  var query = {userId: options.userId};

  var now = Date.now();
  var update = {
    token: token,
    expirationDate: new Date(now + tokenExpiration)
  };
  options = {};
  options.upsert = true;
  Token.findOneAndUpdate(query, update, options, function(err, newToken) {
    if (err) {
      console.log('Could not create token for user: ' + query.userId);
    }

    callback(err, newToken);
  });
};

exports.removeToken = function(token, callback) {
  Token.findByIdAndRemove(token._id, function(err) {
    callback(err);
  });
};

exports.removeTokensForUser = function(user, callback) {
  Token.remove({user: user._id}, function(err, numberRemoved) {
    callback(err, numberRemoved);
  });
};
