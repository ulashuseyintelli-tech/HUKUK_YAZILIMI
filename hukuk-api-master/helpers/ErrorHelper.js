const createError = (message, status, code) => {
  if (!status || status < 100 || status > 600) {
    status = 500;
  }
  let err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

const createErrorWithObject = (ERR, status) => {
  return createError(ERR.message, status || ERR.status, ERR.code);
};

const serverError = (error) => {
  return { error, status: 500, code: "server-error" };
};

module.exports = {
  createError,
  createErrorWithObject,
  serverError,
};
