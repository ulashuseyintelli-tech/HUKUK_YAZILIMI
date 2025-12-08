const express = require("express"),
  Company = require("../models/CompanyModel"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Company.find({ lawOfficeId })
    .then((persons) => {
      res.send(persons);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/:companyId", Middlewares.verifyToken, (req, res, next) => {
  const { companyId } = req.params;
  Company.findById(companyId)
    .then((company) => {
      res.send(company);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Company.create({ lawOfficeId, ...req.body })
    .then((company) => {
      res.send(company);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
