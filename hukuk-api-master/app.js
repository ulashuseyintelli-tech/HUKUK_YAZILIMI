const express = require("express"),
  bodyParser = require("body-parser"),
  logger = require("morgan");
app = express();
const cors = require("cors");

const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: [
      "http://localhost:3030",
      "https://hukuk.toprak.io",
      "http://localhost:3000",
    ],
  },
});

app.set("socketio", io);

io.on("connection", (socket) => {
  socket.on("subscribe", (data) => {
    socket.join(data.lawOfficeId);
  });
});

const config = require("./config");
app.set("API_SECRET_KEY", config.API_SECRET_KEY);
app.set("DB_URL", config.DB_URL);

const mongoose = require("mongoose");

mongoose.set("debug", true);

const indexRouter = require("./routes/indexRoutes");
const userRouter = require("./routes/userRoutes");
const lawOfficeRouter = require("./routes/lawOfficeRoutes");
const clientRouter = require("./routes/clientRoutes");
const debtorRouter = require("./routes/debtorRoutes");
const paymentRouter = require("./routes/paymentRoutes");
const dueRouter = require("./routes/dueRoutes");
const executionOfficeRouter = require("./routes/executionOfficeRoutes");
const caseRouter = require("./routes/caseRoutes");
const taskRouter = require("./routes/taskRoutes");
const inpoundmentRouter = require("./routes/inpoundmentRoutes");
const notificationRouter = require("./routes/notificationRoutes");
const queryRouter = require("./routes/queryRoutes");
const vehicleRouter = require("./routes/vehicleRoutes");
const ssiRouter = require("./routes/ssiRoutes");
const taxDueRouter = require("./routes/taxDueRoutes");
const bankQueryRouter = require("./routes/bankQueryRoutes");
const immovableRouter = require("./routes/immovableRoutes");
const creditorRouter = require("./routes/creditorRoutes");
const deFactoRouter = require("./routes/deFactoRoutes");
const saleRouter = require("./routes/saleRoutes");
const companyRouter = require("./routes/companyRoutes");
const shareRouter = require("./routes/shareRoutes");
const creditorCaseRouter = require("./routes/creditorCaseRoutes");
const commitmentRouter = require("./routes/commitmentRoutes");
const customsDueRouter = require("./routes/customsDueRoutes");
const normalAssetRouter = require("./routes/normalAssetRoutes");
const patentRouter = require("./routes/patentRoutes");
const guaranteeRouter = require("./routes/guaranteeRoutes");
const collectionRouter = require("./routes/collectionRoutes");
const expenseRouter = require("./routes/expenseRoutes");
const familyMemberRouter = require("./routes/familyMemberRoutes");
const courtRouter = require("./routes/courtRoutes");
const intelRouter = require("./routes/intelRoutes");
const assetRouter = require("./routes/assetRoutes");
const customsOfficeRouter = require("./routes/customsOfficeRoutes");
const taxOfficeRouter = require("./routes/taxOfficeRoutes");
const landRegistryOfficeRouter = require("./routes/landRegistryOfficeRoutes");
const pledgedMovableRouter = require("./routes/pledgedMovableRoutes");

const db = require("./helpers/db.js")();

app.use(
  cors({
    origin: ["http://localhost:3030", "https://hukuk.toprak.io"],
    optionsSuccessStatus: 200,
  })
);

app.use(logger("dev"));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use("/", indexRouter);
app.use("/user", userRouter);
app.use("/case", caseRouter);
app.use("/lawOffice", lawOfficeRouter);
app.use("/client", clientRouter);
app.use("/debtor", debtorRouter);
app.use("/payment", paymentRouter);
app.use("/due", dueRouter);
app.use("/executionOffice", executionOfficeRouter);
app.use("/task", taskRouter);
app.use("/inpoundment", inpoundmentRouter);
app.use("/notification", notificationRouter);
app.use("/query", queryRouter);
app.use("/vehicle", vehicleRouter);
app.use("/ssi", ssiRouter);
app.use("/taxDue", taxDueRouter);
app.use("/bankQuery", bankQueryRouter);
app.use("/immovable", immovableRouter);
app.use("/creditor", creditorRouter);
app.use("/deFacto", deFactoRouter);
app.use("/sale", saleRouter);
app.use("/company", companyRouter);
app.use("/share", shareRouter);
app.use("/creditorCase", creditorCaseRouter);
app.use("/commitment", commitmentRouter);
app.use("/customsDue", customsDueRouter);
app.use("/normalAsset", normalAssetRouter);
app.use("/patent", patentRouter);
app.use("/guarantee", guaranteeRouter);
app.use("/collection", collectionRouter);
app.use("/expense", expenseRouter);
app.use("/familyMember", familyMemberRouter);
app.use("/court", courtRouter);
app.use("/intel", intelRouter);
app.use("/asset", assetRouter);
app.use("/taxOffice", taxOfficeRouter);
app.use("/landRegistryOffice", landRegistryOfficeRouter);
app.use("/customsOffice", customsOfficeRouter);
app.use("/pledgedMovable", pledgedMovableRouter);

const Middlewares = require("./middlewares/Middlewares");
const TaskHelper = require("./helpers/TaskHelper");
const NotificationHelper = require("./helpers/NotificationHelper");
const SaleModel = require("./models/SaleModel");
const NormalAssetModel = require("./models/NormalAssetModel");

app.use(Middlewares.error.handleError);

const watchUpdates = () => {
  mongoose.connection.watch(null).on("change", (data) => {
    if (data.ns.coll !== "tasklogs" && data.ns.coll !== "tasks") {
      mongoose.connection.collections[data.ns.coll]
        .findOne({
          _id: data.documentKey._id,
        })
        .then((doc) => {
          if (doc && doc.caseId) {
            mongoose.connection.collections["cases"]
              .updateOne(
                { _id: doc.caseId },
                { $set: { updatedAt: new Date() } }
              )
              .then()
              .catch((e) => console.log(e));
          }
          if (
            doc &&
            data.operationType === "update" &&
            data.updateDescription &&
            (data.updateDescription.updatedFields.claim103Status ||
              data.updateDescription.updatedFields.cadastreNotificationStatus ||
              data.updateDescription.updatedFields
                .zoningStatusNotificationStatus ||
              data.updateDescription.updatedFields
                .inpoundmentNotificationStatus ||
              data.updateDescription.updatedFields
                .chamberOfCommerceNotificationStatus ||
              data.updateDescription.updatedFields.claim100Status ||
              data.updateDescription.updatedFields
                .restrictionsNotificationStatus ||
              data.updateDescription.updatedFields.garnishmentClaim100Status ||
              data.updateDescription.updatedFields
                .appraisalNotificationStatus ||
              data.updateDescription.updatedFields.memorialStatus)
          ) {
            SaleModel.find({
              debtorId: doc.debtorId,
              caseId: doc.caseId,
              assetId: doc._id,
            })
              .then(async (sales) => {
                if (
                  data.ns.coll === "defactos" ||
                  data.ns.coll === "customsdues"
                ) {
                  await NormalAssetModel.find({
                    parentAssetId: data.documentKey._id,
                  }).then((receivedAssets) => {
                    doc.receivedAssets = receivedAssets;
                  });
                }
                doc.sales = sales;
                io.emit(`${doc._id} reload`, { doc });
              })
              .catch((e) => console.log(e));
          }
        })
        .catch((e) => console.log(e));
    }
  });
};

const port = process.env.PORT || 8081;

http.listen(port, (err) => {
  if (err) throw err;
  console.log(`listening ${port}`);
});

// if (process.env.NODE_ENV === "production") {
TaskHelper.watch(io);
NotificationHelper.watch(io);
watchUpdates();
// }
