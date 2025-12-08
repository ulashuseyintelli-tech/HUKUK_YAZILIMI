const jwt = require("jsonwebtoken");

const verifyToken = (token) => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, app.get("API_SECRET_KEY"), (error, decoded) => {
      error ? reject(error) : resolve(decoded);
    });
  });
};

const generateToken = (data = {}, expiresIn = "24h") => {
  return new Promise((resolve, reject) => {
    jwt.sign(data, app.get("API_SECRET_KEY"), { expiresIn }, (error, token) => {
      error ? reject(error) : resolve(token);
    });
  });
};

const generateUserToken = (user, expiresIn = "99999h") => {
  return new Promise((resolve, reject) => {
    const { _id, email, lawOfficeId, name, surname } = user;
    jwt.sign(
      { _id, email, lawOfficeId, name, surname },
      app.get("API_SECRET_KEY"),
      { expiresIn },
      (error, token) => {
        error ? reject(error) : resolve(token);
      }
    );
  });
};

module.exports = {
  verifyToken,
  generateToken,
  generateUserToken,
};
