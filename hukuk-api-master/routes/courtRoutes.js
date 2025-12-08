const express = require("express"),
  Court = require("../models/CourtModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const { handleCourtTasks } = require("../helpers/CourtHelper");

router.post("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { caseId, debtorId, queryId } = req.params;
  Court.create({
    caseId,
    debtorId,
    lawOfficeId,
    ...req.body,
  })
    .then((court) => {
      handleCourtTasks(req, res, court);
      res.send(court);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:courtId", Middlewares.verifyToken, (req, res, next) => {
  const { courtId } = req.params;
  Court.findOneAndUpdate(
    { _id: courtId },
    { ...req.body, lastUpdate: new Date() },
    { new: true }
  )
    .then((court) => {
      res.send(court);
      handleCourtTasks(req, res, court);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:courtId/:property", Middlewares.verifyToken, (req, res, next) => {
  const { courtId, property } = req.params;
  const { propertyValue } = req.body;
  Court.findOneAndUpdate(
    { _id: courtId },
    {
      [property]:
        propertyValue.data !== undefined ? propertyValue.data : propertyValue,
      lastUpdate: new Date(),
    },
    { new: true }
  )
    .then((court) => {
      res.send(court);
      handleCourtTasks(req, res, court);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  Court.find(req.params)
    .then((courts) => {
      res.send(courts);
    })
    .catch((e) => next(serverError(e)));
});

router.get(
  "/:caseId/:debtorId/count",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    Court.find(req.params)
      .count()
      .then((count) => {
        res.send({ count });
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/:debtorId/:type",
  Middlewares.verifyToken,
  (req, res, next) => {
    Court.findOne(req.params)
      .then((court) => {
        res.send(court);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
