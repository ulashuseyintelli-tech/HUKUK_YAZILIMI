const express = require("express"),
  LawOffice = require("../models/LawOfficeModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const { getDefaultTaskTransitionDays } = require("../constants");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  LawOffice.aggregate([
    {
      $lookup: {
        from: "lawyers",
        localField: "_id",
        foreignField: "lawOfficeId",
        as: "lawyers",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "boss",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "lawOfficeId",
        as: "users",
      },
    },
  ])
    .exec()
    .then((lawOffices) => {
      res.send(lawOffices);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  LawOffice.create({
    userId: _id,
    ...req.body,
  })
    .then((lawOffice) => {
      res.send(lawOffice);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:lawOfficeId", Middlewares.verifyToken, (req, res, next) => {
  LawOffice.findByIdAndUpdate(
    req.params.lawOfficeId,
    { ...req.body },
    { new: true }
  )
    .then((doc) => res.send(doc))
    .catch((e) => next(serverError(e)));
});

module.exports = router;
