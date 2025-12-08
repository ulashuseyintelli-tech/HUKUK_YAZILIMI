const express = require("express"),
  Due = require("../models/DueModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const { createDueTasks } = require("../helpers/DueHelper");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.get("/case/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  Due.find({ caseId })
    .then((dues) => {
      res.send(dues);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/case/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  Due.create({ caseId, ...req.body })
    .then((due) => {
      res.send(due);
      createDueTasks(req, res, due);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:dueId", Middlewares.verifyToken, (req, res, next) => {
  const { dueId } = req.params;
  Due.findByIdAndUpdate(dueId, { ...req.body }, { new: true })
    .then((due) => {
      res.send(due);
      createDueTasks(req, res, due);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
