const express = require("express"),
  LandRegistryOffice = require("../models/LandRegistryOfficeModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;

  LandRegistryOffice.find({ lawOfficeId })
    .then((offices) => res.send(offices))
    .catch((e) => next(serverError(e)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  LandRegistryOffice.create({ lawOfficeId, ...req.body })
    .then((office) => res.send(office))
    .catch((e) => next(serverError(e)));
});

router.put("/:officeId", Middlewares.verifyToken, (req, res, next) => {
  const body = req.body;
  if (body._id) {
    delete body._id;
  }
  LandRegistryOffice.findByIdAndUpdate(req.params.officeId, body, { new: true })
    .then((office) => {
      res.send(office);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
