const express = require("express"),
  Debtor = require("../models/DebtorModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

const CaseModel = require("../models/CaseModel");
const {
  handleDebtorTasks,
  defaultAggregate,
  getDefaltAggregateWithCaseId,
} = require("../helpers/DebtorHelper");
const { createLookup } = require("../helpers/DatabaseHelper");

router.post("/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { caseId } = req.params;
  Debtor.create({
    lawOfficeId,
    ...req.body,
    isThirdPerson: false,
  })
    .then((debtor) => {
      Debtor.aggregate([
        {
          $match: {
            _id: mongoose.Types.ObjectId(debtor._id),
          },
        },
        ...getDefaltAggregateWithCaseId(caseId),
      ])
        .then((debtor) => {
          res.send(debtor[0]);
        })
        .catch((e) => next(serverError(e)));
      handleDebtorTasks(req, res, caseId, debtor);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  Debtor.findByIdAndUpdate(
    req.params.debtorId,
    { ...req.body, lastUpdate: new Date() },
    { new: true }
  )
    .then((debtor) => {
      Debtor.aggregate([
        {
          $match: {
            _id: mongoose.Types.ObjectId(debtor._id),
          },
        },
        ...getDefaltAggregateWithCaseId(req.params.caseId),
      ])
        .then((debtor) => {
          res.send(debtor[0]);
          if (
            debtor[0].isThirdPerson === false ||
            debtor[0].isBecameDebtor === true
          ) {
            handleDebtorTasks(req, res, req.params.caseId, debtor[0]);
          }
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

// router.put(
//   "/:caseId/:debtorId/:property",
//   Middlewares.verifyToken,
//   (req, res, next) => {
//     const { debtorId, property } = req.params;
//     const { propertyValue } = req.body;
//     Debtor.findByIdAndUpdate(
//       debtorId,
//       { [property]: propertyValue, lastUpdate: new Date() },
//       { new: true }
//     )
//       .then((debtor) => {
//         if (debtor.isThirdPerson === false || debtor.isBecameDebtor === true) {
//           handleDebtorTasks(req, res, req.params.caseId, debtor);
//         }
//         res.send(debtor);
//       })
//       .catch((e) => next(serverError(e)));
//   }
// );

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Debtor.aggregate([
    {
      $match: {
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
        $or: [{ isThirdPerson: false }, { isBecameDebtor: true }],
      },
    },
    ...defaultAggregate,
  ]).then((debtors) => {
    res.send(debtors);
  });
});

router.get("/list", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Debtor.aggregate([
    {
      $match: {
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
        // $or: [{ isThirdPerson: false }, { isBecameDebtor: true }],
      },
    },
    createLookup("cases", "_id", "debtorIds", "cases"),
  ])
    .then((debtors) => {
      res.send(debtors);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/pure", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Debtor.find({ lawOfficeId })
    .then((debtors) => {
      return debtors;
    })
    .catch((e) => next(serverError(e)));
});

router.get("/case/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  CaseModel.findById(caseId)
    .then((caseObject) => {
      const { debtorIds } = caseObject;
      Debtor.aggregate([
        {
          $match: {
            _id: { $in: debtorIds },
            $or: [{ isThirdPerson: false }, { isBecameDebtor: true }],
          },
        },
        ...getDefaltAggregateWithCaseId(caseId),
      ]).then((debtors) => {
        res.send(debtors);
      });
    })
    .catch((e) => next(serverError(e)));
});

router.post(
  "/:caseId/thirdPerson",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    Debtor.create({
      lawOfficeId,
      ...req.body,
      isThirdPerson: true,
    })
      .then((debtor) => {
        res.send(debtor);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get("/thirdPerson", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Debtor.find({ lawOfficeId, isThirdPerson: true })
    .then((persons) => {
      res.send(persons);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/thirdPerson/:_id", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = req.params;
  Debtor.findById(_id)
    .then((person) => {
      res.send(person);
    })
    .catch((e) => next(serverError(e)));
});

router.get(
  "/thirdPerson/type/:type",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    Debtor.find({ lawOfficeId, isThirdPerson: true, type: req.params.type })
      .then((persons) => {
        res.send(persons);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.post("/search/same", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { name, surname, institutionName } = req.body;
  let searchObject = { lawOfficeId };
  if (institutionName) {
    searchObject.institutionName = { $regex: new RegExp(institutionName, "i") };
  } else {
    searchObject.name = { $regex: new RegExp(name, "i") };
    searchObject.surname = { $regex: new RegExp(surname, "i") };
  }
  Debtor.find(searchObject)
    .then((debtors) => {
      Debtor.aggregate([
        {
          $match: { _id: { $in: debtors.map((d) => d._id) } },
        },
        ...defaultAggregate,
      ])
        .then((debtors) => {
          res.send(debtors);
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
