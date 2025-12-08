const express = require("express"),
  User = require("../models/UserModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

const mongoose = require("mongoose");

router.get("/token", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  User.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(_id),
      },
    },
    {
      $lookup: {
        from: "lawoffices",
        foreignField: "_id",
        localField: "lawOfficeId",
        as: "lawOffice",
      },
    },
  ])
    .then((user) => {
      user.length > 0
        ? res.status(200).send({ user: user[0] })
        : next(createError("", 404, "user-not-found"));
    })
    .catch((e) => next(serverError(e)));
});

router.get("/admin", Middlewares.verifyAdmin, (req, res, next) => {
  res.sendStatus(200);
});

router.get("/:type/list", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { type } = req.params;
  const aggregates = [
    {
      $match: {
        type,
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
      },
    },
  ];
  if (type === "lawyer") {
    aggregates.push({
      $lookup: {
        from: "cases",
        localField: "_id",
        foreignField: "lawyerIds",
        as: "cases",
      },
    });
  }
  User.aggregate(aggregates)
    .then((users) => {
      res.send(users);
    })
    .catch((err) => next(serverError(err)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Helper.user
    .generateHash(req.body.password)
    .then((hash) => {
      User.create({ ...req.body, lawOfficeId, password: hash })
        .then((user) => {
          res.send(user);
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

router.post("/signin", Middlewares.login, (req, res, next) => {
  const { user } = res.locals;
  Helper.token
    .generateUserToken(user)
    .then((token) => res.send({ token, user }))
    .catch((err) => next(serverError(err)));
});

// router.post("/register", Middlewares.registration, (req, res, next) => {
//   const { username, email, password } = req.body;
//   Helper.user
//     .generateHash(password)
//     .then((hash) => {
//       User.create({ username, email, password: hash })
//         .then((user) => {
//           Helper.token
//             .generateUserToken(user)
//             .then((token) => {
//               res.status(200).send({ token, user });
//             })
//             .catch((err) => next(serverError(err)));
//         })
//         .catch((err) => next(serverError(err)));
//     })
//     .catch((err) => next(serverError(err)));
// });

router.post(
  "/change-password",
  Middlewares.passwordChange,
  (req, res, next) => {
    const { oldPassword, newPassword } = req.body;
    const { user } = res.locals;
    if (oldPassword === newPassword) {
      next(createError("", 400, "same-password"));
    } else {
      Helper.user
        .generateHash(newPassword)
        .then((hash) => {
          User.findByIdAndUpdate(
            user._id,
            { $set: { password: hash } },
            { new: true },
            (err, updatedUser) => {
              if (err) next(serverError(err));
              res.status(200).send({ user: updatedUser });
            }
          );
        })
        .catch((err) => next(serverError(err)));
    }
  }
);

router.put(
  "/caseInitializationNoteVisibility",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { _id } = res.locals.decoded;
    const { isCaseInitializationNoteVisible } = req.body;
    User.updateOne({ _id }, { isCaseInitializationNoteVisible })
      .then(() => {
        res.send(200);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
