const express = require("express"),
  Intel = require("../models/IntelModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const { sendClientIntelEmail } = require("../helpers/EmailHelper");
const { serverError } = require("../helpers/ErrorHelper");
const { createIntelTasks } = require("../helpers/IntelHelper");
const Middlewares = require("../middlewares/Middlewares");
const CaseModel = require("../models/CaseModel");
const ClientModel = require("../models/ClientModel");

router.get("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId, debtorId } = req.params;
  Intel.findOne({ caseId, debtorId })
    .then((intel) => {
      res.send(intel);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId, debtorId } = req.params;
  Intel.create({ caseId, debtorId, ...req.body })
    .then((intel) => {
      createIntelTasks(req, res, intel);
      if (intel.areTypesSelected === null) {
        Intel.findByIdAndUpdate(
          intel._id,
          { areTypesSelected: false },
          { new: true }
        )
          .then((intel) => {
            res.send(intel);
          })
          .catch((e) => next(serverError(e)));
      } else {
        if (intel.selectedTypes.includes("client")) {
          Intel.updateOne({ _id: intel._id }, { "client.isEmailSent": true })
            .then()
            .catch();
          CaseModel.findById(caseId)
            .then((currentCase) => {
              ClientModel.find({ _id: currentCase.clientIds })
                .then((clients) => {
                  clients = clients.filter((c) => c.emails.length > 0);
                  clients.map((c) => {
                    c.emails.map((email) => {
                      sendClientIntelEmail(email);
                    });
                  });
                })
                .catch((e) => console.log(e));
            })
            .catch((e) => console.log(e));
        }
        res.send(intel);
      }
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:intelId", Middlewares.verifyToken, (req, res, next) => {
  const { intelId } = req.params;
  Intel.findByIdAndUpdate(intelId, { ...req.body }, { new: true })
    .then((intel) => {
      createIntelTasks(req, res, intel);
      if (intel.areTypesSelected === null) {
        Intel.findByIdAndUpdate(
          intel._id,
          { areTypesSelected: false },
          { new: true }
        )
          .then((intel) => {
            res.send(intel);
          })
          .catch((e) => next(serverError(e)));
      } else {
        res.send(intel);
      }
    })
    .catch((e) => next(serverError(e)));
});

router.put(
  "/:intelId/:property/:innerProperty",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { intelId, property, innerProperty } = req.params;
    const { propertyValue } = req.body;
    Intel.findByIdAndUpdate(
      intelId,
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((intel) => {
        createIntelTasks(req, res, intel);
        if (property === "selectedTypes") {
          if (
            intel.selectedTypes.includes("client") &&
            !intel.client.isEmailSent
          ) {
            Intel.updateOne({ _id: intel._id }, { "client.isEmailSent": true })
              .then()
              .catch();
            ClientModel.find({ caseId: intel.caseId })
              .then((clients) => {
                clients = clients.filter((c) => c.emails.length > 0);
                clients.map((c) => {
                  c.emails.map((email) => {
                    sendClientIntelEmail(email);
                  });
                });
              })
              .catch((e) => console.log(e));
          }

          Intel.findByIdAndUpdate(
            intel._id,
            { areTypesSelected: true },
            { new: true }
          )
            .then((intel) => {
              res.send(intel);
            })
            .catch((e) => next(serverError(e)));
        } else {
          res.send(intel);
        }
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
