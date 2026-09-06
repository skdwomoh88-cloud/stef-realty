const mongoose = require("mongoose");
const { USER_ROLE_VALUES, LEGACY_ROLES } = require("../constants/roleCatalogue");

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  password: {
    type: String,
    required: true,
    select: false
  },

  authVersion: {
    type: Number,
    default: 0,
    min: 0,
    select: false,
  },

  role: {
  type: String,
  enum: USER_ROLE_VALUES,
  default: LEGACY_ROLES.CUSTOMER,
},

  isActive: {
  type: Boolean,
  default: true,
},

}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.authVersion;
      return ret;
    },
  },
  toObject: {
    transform: (doc, ret) => {
      delete ret.password;
      delete ret.authVersion;
      return ret;
    },
  },
});

UserSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model("User", UserSchema);
