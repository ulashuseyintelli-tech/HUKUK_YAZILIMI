const express = require("express"),
  Commitment = require("../models/CommitmentModel"),
  router = express.Router();

const { TASK_STATUS, TASK_TYPE } = require("../constants");
const { serverError } = require("../helpers/ErrorHelper");
const { createTask } = require("../helpers/TaskHelper");
const Middlewares = require("../middlewares/Middlewares");
const TaskModel = require("../models/TaskModel");

router.post("/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  Commitment.create({
    caseId,
    ...req.body,
  })
    .then((commitment) => {
      res.send(commitment);
      createTasks(commitment, res);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/:commitmentId", Middlewares.verifyToken, (req, res, next) => {
  Commitment.findById(req.params.commitmentId)
    .then((commitment) => {
      res.send(commitment);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/case/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  Commitment.find({ caseId })
    .then((commitments) => {
      res.send(commitments);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:commitmentId", Middlewares.verifyToken, (req, res, next) => {
  const { commitmentId } = req.params;
  Commitment.findOneAndUpdate(
    { _id: commitmentId },
    { ...req.body, lastUpdate: new Date() },
    { new: true }
  )
    .then((commitment) => {
      res.send(commitment);
      createTasks(commitment, res, true);
    })
    .catch((e) => next(serverError(e)));
});

const createTasks = async (commitment, res, removeBefore) => {
  const firstLevelObject = {
    debtorId: commitment.debtorId,
    caseId: commitment.caseId,
  };
  if (removeBefore) {
    await TaskModel.updateMany(
      {
        assetType: "COMMITMENT",
        assetId: commitment._id,
        ...firstLevelObject,
        type: TASK_TYPE.COMMITMENT_COLLECTION_REQUIRED,
      },
      { status: TASK_STATUS.CANCELLED_BY_SYSTEM }
    )
      .then((res) => {})
      .catch((e) => console.log(e));
  }

  const nonPaidInstallments = commitment.calculatedInstallments.filter(
    (i) => !i.isPaid
  );
  if (nonPaidInstallments.length > 0) {
    let minDate = nonPaidInstallments[0].date;
    nonPaidInstallments.map((i) => {
      if (new Date(i.date) < new Date(minDate)) {
        minDate = i.date;
      }
    });
    createTask(
      res,
      firstLevelObject,
      {
        assetType: "COMMITMENT",
        assetId: commitment._id,
        status:
          new Date(minDate) < new Date()
            ? TASK_STATUS.PENDING
            : TASK_STATUS.FUTURE,
        type: TASK_TYPE.COMMITMENT_COLLECTION_REQUIRED,
      },
      false,
      new Date(minDate)
    )
      .then((task) => {})
      .catch((e) => console.log(e));
  }
};

module.exports = router;
