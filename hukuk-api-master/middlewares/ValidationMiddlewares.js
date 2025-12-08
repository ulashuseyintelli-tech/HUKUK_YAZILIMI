const User = require("../models/UserModel"),
  Helper = require("../helpers/Helper");

const createError = require("../helpers/ErrorHelper").createError;

const validateNameInput = (req, res, next) => {
  const { name } = req.body;
  const response = Helper.input.nameValidation(name);
  response.status
    ? next()
    : next(createError(response.message, 400, "invalid-name"));
};

const validateEmailInput = (req, res, next) => {
  const { email } = req.body;
  const response = Helper.input.emailValidation(email);
  response.status
    ? next()
    : next(createError(response.message, 400, "invalid-email"));
};

const validatePasswordInput = (req, res, next) => {
  const password = req.body.password || req.body.newPassword;
  const response = Helper.input.passwordValidation(password);
  response.status
    ? next()
    : next(createError(response.message, 400, "invalid-password"));
};

const validateUserNotExist = (req, res, next) => {
  const { email } = req.body;

  User.findOne({ email })
    .then((user) => {
      if (user) {
        next(createError("This email adress is in use", 400, "email-exist"));
      } else {
        next();
      }
    })
    .catch((err) => next(Helper.error.serverError(err)));
};

module.exports = {
  validateNameInput,
  validateEmailInput,
  validatePasswordInput,
  validateUserNotExist,
};
