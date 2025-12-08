const rateLimit = require("express-rate-limit");

const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message:
    "Create account rate limit exceeded. Try again later."
});

const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message:
    "Login rate limit exceeded. Try again later. "
});

module.exports = {
  createAccountLimiter,
  loginLimiter,
}