const express = require("express"),
  TaxOfice = require("../models/TaxOfficeModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;

  TaxOfice.find({ lawOfficeId })
    .then((offices) => res.send(offices))
    .catch((e) => next(serverError(e)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  TaxOfice.create({ lawOfficeId, ...req.body })
    .then((office) => res.send(office))
    .catch((e) => next(serverError(e)));
});

router.put("/:officeId", Middlewares.verifyToken, (req, res, next) => {
  const body = req.body;
  if (body._id) {
    delete body._id;
  }
  TaxOfice.findByIdAndUpdate(req.params.officeId, body, { new: true })
    .then((office) => {
      res.send(office);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
