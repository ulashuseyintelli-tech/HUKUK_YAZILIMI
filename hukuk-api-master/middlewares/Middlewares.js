const ErrorMiddlewares = require("./ErrorMiddlewares"),
  ValidationMiddlewares = require("./ValidationMiddlewares"),
  VerificationMiddlewares = require("./VerificationMiddlewares"),
  RateLimitationMiddlewares = require("./RateLimitationMiddlewares");

const verifyToken = [VerificationMiddlewares.verifyToken];
const verifyAdmin = [
  VerificationMiddlewares.verifyToken,
  VerificationMiddlewares.verifyAdmin,
];

const loginMiddlewares = [
  VerificationMiddlewares.verifyPassword,
  RateLimitationMiddlewares.loginLimiter,
];

const registrationMiddlewares = [
  ValidationMiddlewares.validateEmailInput,
  ValidationMiddlewares.validatePasswordInput,
  ValidationMiddlewares.validateUserNotExist,
  RateLimitationMiddlewares.createAccountLimiter,
];

const passwordChangeMiddlewares = [
  VerificationMiddlewares.verifyToken,
  VerificationMiddlewares.verifyPassword,
  ValidationMiddlewares.validatePasswordInput,
];

module.exports = {
  error: ErrorMiddlewares,
  validation: ValidationMiddlewares,
  verification: VerificationMiddlewares,
  limit: RateLimitationMiddlewares,
  verifyToken,
  verifyAdmin,
  login: loginMiddlewares,
  registration: registrationMiddlewares,
  passwordChange: passwordChangeMiddlewares,
};
