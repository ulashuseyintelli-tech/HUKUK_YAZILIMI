const express = require("express"),
  Payment = require("../models/PaymentModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.get("/case/:caseId", (req, res, next) => {
  const { caseId } = req.params;
  Payment.find({ caseId })
    .then((payments) => {
      res.send(payments);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/case/:caseId", (req, res, next) => {
  const { caseId } = req.params;
  Payment.create({ caseId, ...req.body })
    .then((payment) => {
      res.send(payment);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:paymentId", Middlewares.verifyToken, (req, res, next) => {
  const { paymentId } = req.params;
  Payment.findByIdAndUpdate(paymentId, { ...req.body }, { new: true })
    .then((payment) => {
      res.send(payment);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
