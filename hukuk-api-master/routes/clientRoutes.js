const express = require("express"),
  Client = require("../models/ClientModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const { createLookup } = require("../helpers/DatabaseHelper");

Client.find({}).then((clients) => {
  clients.map((client) => {
    if (!client.name && !client.surname) {
      console.log({ client });
      Client.updateOne(
        { _id: client._id },
        { name: "Test", surname: "Müvekkil" }
      ).exec();
    }
  });
});

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Client.find({ lawOfficeId })
    .then((clients) => {
      res.send(clients);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/list", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Client.aggregate([
    {
      $match: {
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
      },
    },
    createLookup("cases", "_id", "clientIds", "cases"),
  ])
    .then((clients) => {
      res.send(clients);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { _id } = res.locals.decoded;
  Client.count({ lawOfficeId: _id })
    .then((count) => {
      Client.create({ lawOfficeId, clientNumber: count + 1, ...req.body })
        .then((client) => {
          res.send(client);
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:clientId", Middlewares.verifyToken, (req, res, next) => {
  Client.findByIdAndUpdate(req.params.clientId, { ...req.body }, { new: true })
    .then((debtor) => {
      res.send(debtor);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
