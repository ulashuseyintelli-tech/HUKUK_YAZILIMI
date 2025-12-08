const express = require("express"),
  Creditor = require("../models/CreditorModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

// Creditor.deleteMany().exec();

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Creditor.find({ lawOfficeId })
    .then((creditors) => {
      res.send(creditors);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Creditor.create({ lawOfficeId, ...req.body })
    .then((creditor) => {
      res.send(creditor);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:creditorId", Middlewares.verifyToken, (req, res, next) => {
  const body = req.body;
  if (body._id) {
    delete body._id;
  }
  Creditor.findByIdAndUpdate(req.params.creditorId, body, { new: true })
    .then((creditor) => {
      res.send(creditor);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
