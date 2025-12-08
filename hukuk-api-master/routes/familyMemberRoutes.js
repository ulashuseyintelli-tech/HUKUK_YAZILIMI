const express = require("express"),
  FamilyMember = require("../models/FamilyMemberModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { serverError } = require("../helpers/ErrorHelper");
const { createFamilyMemberTasks } = require("../helpers/FamilyMemberHelper");
const Middlewares = require("../middlewares/Middlewares");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    FamilyMember.create({
      caseId,
      debtorId,
      queryId,
      ...req.body,
    })
      .then((doc) => {
        createFamilyMemberTasks(req, res, doc);
        res.send(doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    FamilyMember.aggregate([
      {
        $match: {
          debtorId: mongoose.Types.ObjectId(debtorId),
          caseId: mongoose.Types.ObjectId(caseId),
        },
      },
    ])
      .then((docs) => {
        res.send(docs);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:familyMemberId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { familyMemberId, property } = req.params;
    const { propertyValue } = req.body;
    FamilyMember.findOneAndUpdate(
      { _id: familyMemberId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((doc) => {
        res.send(doc);
        createFamilyMemberTasks(req, res, doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
