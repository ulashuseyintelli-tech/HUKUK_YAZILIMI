const { serverError } = require("../helpers/ErrorHelper");
const LawOfficeModel = require("../models/LawOfficeModel");
const User = require("../models/UserModel"),
  Helper = require("../helpers/Helper");

const createError = Helper.error.createError;

const verifyToken = (req, res, next) => {
  const token =
    req.headers["x-auth-token"] || req.body.token || req.query.token;
  if (token) {
    Helper.token
      .verifyToken(token)
      .then((decoded) => {
        LawOfficeModel.findById(decoded.lawOfficeId)
          .then((lawOffice) => {
            res.locals.lawOffice = lawOffice;
            res.locals.decoded = decoded;
            next();
          })
          .catch((e) => next(serverError(e)));
      })
      .catch(() => next(createError("", 400, "invalid-token")));
  } else {
    next(createError("", 400, `token-is-${token}`));
  }
};

const verifyAdmin = (req, res, next) => {
  const { _id } = res.locals.decoded;
  User.findById(_id)
    .then((user) => {
      user && user.type === 0
        ? next()
        : next(createError("", 401, "not-admin"));
    })
    .catch((err) => next(Helper.error.serverError(err)));
};

const verifyPassword = (req, res, next) => {
  const password = req.body.password || req.body.oldPassword;
  const email = req.body.email || res.locals.decoded.email;
  User.findOne({ email })
    .then((user) => {
      if (user) {
        Helper.user
          .compareHash(password, user.password)
          .then((status) => {
            if (status) {
              res.locals.user = user;
              next();
            } else {
              next(createError("", 400, "wrong-password"));
            }
          })
          .catch((err) => next(Helper.error.serverError(err)));
      } else {
        next(createError("", 404, "user-not-found"));
      }
    })
    .catch((err) => next(Helper.error.serverError(err)));
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyPassword,
};
