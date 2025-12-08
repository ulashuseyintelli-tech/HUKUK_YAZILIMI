const express = require("express"),
  Inpoundment = require("../models/InpoundmentModel"),
  Task = require("../models/TaskModel"),
  LawOffice = require("../models/LawOfficeModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

const constants = require("../constants");

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { caseId, debtorId, type, steps } = res.locals.decoded;
  Inpoundment.create({
    caseId,
    debtorId,
    type,
    steps,
  })
    .then((inpoundment) => {
      res.status(200).send(inpoundment);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
