const express = require("express"),
  Expense = require("../models/ExpenseModel"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.post("/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  const { caseId } = req.params;
  Expense.create({
    caseId,
    userId: _id,
    ...req.body,
  })
    .then((expense) => {
      // createSsiTasks(req, res, ssi);
      res.send(expense);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  const { assetId, expenseType } = req.query;
  const matchObject = { caseId };
  if (assetId && assetId !== "undefined") {
    matchObject.assetId = assetId;
  }
  if (expenseType && expenseType !== "undefined") {
    matchObject.type = expenseType;
  }
  Expense.find(matchObject)
    .then((docs) => res.send(docs))
    .catch((e) => next(serverError(e)));
});

router.put(
  "/:expenseId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { expenseId, property } = req.params;
    const { propertyValue } = req.body;
    Expense.findOneAndUpdate(
      { _id: expenseId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((expense) => {
        res.send(expense);
        // createSsiTasks(req, res, ssi);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
