const bcrypt = require('bcrypt'),
      User = require('../models/UserModel');

const generateHash = (password) => {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, (error, hash) => {
      error ? reject(error) : resolve(hash)
    })
  })
}

const compareHash = (password, hash) => {
  return new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (error, status) => {
      error ? reject(error) : resolve(status);
    })
  })
}

module.exports = {
  generateHash,
  compareHash,
}