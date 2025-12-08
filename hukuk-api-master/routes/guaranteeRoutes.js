const express = require("express"),
  Guarantee = require("../models/GuaranteeModel"),
  Debtor = require("../models/DebtorModel"),
  router = express.Router();

const { handleDebtorTasks } = require("../helpers/DebtorHelper");
const { serverError } = require("../helpers/ErrorHelper");
const { handleGuaranteeTasks } = require("../helpers/guaranteeHelper");
const Middlewares = require("../middlewares/Middlewares");
const CaseModel = require("../models/CaseModel");

router.post("/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  Guarantee.create({
    caseId,
    ...req.body,
  })
    .then((guarantee) => {
      res.send(guarantee);
      Debtor.findByIdAndUpdate(
        guarantee.thirdPersonId,
        {
          isBecameDebtor: true,
          $push: { thirdPersonReasons: "guarantee" },
          lastUpdate: new Date(),
        },
        { new: true }
      )
        .then((debtor) => {
          CaseModel.updateOne(
            { _id: caseId },
            { $push: { debtorIds: guarantee.thirdPersonId } }
          )
            .then(() => {})
            .catch((e) => console.log(e));
          handleDebtorTasks(req, res, caseId, debtor, false, guarantee);
        })
        .catch((e) => console.log(e));
    })
    .catch((e) => next(serverError(e)));
});

router.get("/:guaranteeId", Middlewares.verifyToken, (req, res, next) => {
  Guarantee.findById(req.params.guaranteeId)
    .then((guarantee) => {
      res.send(guarantee);
    })
    .catch((e) => next(serverError(e)));
});

router.get(
  "/case/:caseId/thirdPerson/:thirdPersonId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, thirdPersonId } = req.params;
    Guarantee.findOne({ thirdPersonId, caseId })
      .then((doc) => {
        res.send(doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get("/case/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  Guarantee.find({ caseId })
    .then((guarantees) => {
      res.send(guarantees);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:guaranteeId", Middlewares.verifyToken, (req, res, next) => {
  const { guaranteeId } = req.params;
  Guarantee.findOneAndUpdate(
    { _id: guaranteeId },
    { ...req.body, lastUpdate: new Date() },
    { new: true }
  )
    .then((guarantee) => {
      res.send(guarantee);
      handleGuaranteeTasks(req, res, guarantee);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
