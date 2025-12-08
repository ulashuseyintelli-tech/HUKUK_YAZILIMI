const express = require("express"),
  Query = require("../models/QueryModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const {
  createQueryTask,
  handleQueryUpdationTasks,
} = require("../helpers/TaskHelper");
const { createBankQueryBulk } = require("../helpers/QueryHelper");

router.post("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId, debtorId } = req.params;
  const { type, bankList } = req.body;
  Query.create({ caseId, debtorId, type })
    .then(async (query) => {
      let bankQueryList = [];
      if (type === "BANK") {
        bankQueryList = await createBankQueryBulk(
          caseId,
          debtorId,
          bankList,
          req,
          res
        );
        res.send({ query, bankQueryList });
      } else {
        res.send(query);
        createQueryTask(res, query);
      }
    })
    .catch((e) => next(serverError(e)));
});

router.post(
  "/:caseId/:debtorId/bulk",
  Middlewares.verifyToken,
  async (req, res, next) => {
    const { caseId, debtorId } = req.params;
    const { queryList } = req.body;
    for (let i = 0; i < queryList.length; i++) {
      const type = queryList[i];
      await Query.create({ caseId, debtorId, type })
        .then(async (query) => {
          await createQueryTask(res, query);
        })
        .catch((e) => console.log(e));
    }
    res.sendStatus(200);
  }
);

router.put("/:queryId", Middlewares.verifyToken, (req, res, next) => {
  const { queryId } = req.params;
  Query.findOneAndUpdate({ _id: queryId }, req.body, { new: true })
    .then((query) => {
      res.send(query);
      handleQueryUpdationTasks(req.body.isResultEmpty, query, res);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
