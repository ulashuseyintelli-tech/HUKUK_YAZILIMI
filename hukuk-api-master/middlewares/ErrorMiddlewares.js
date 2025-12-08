const handleError = (err, req, res, next) => {
  console.log(err);
  const { status, code, message } = err;
  res.status(status).send({code, message});
}

module.exports = {
  handleError,
}