const express = require("express"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

const { getAssetModelByType } = require("../lib/assetLib");
const { handleRestrictionTasks } = require("../helpers/RestrictionHelper");
const { ASSET_TYPE } = require("../constants");
const { createVehicleTasks } = require("../helpers/VehicleHelper");
const { createImmovableTasks } = require("../helpers/ImmovableHelper");
const { createSsiTasks } = require("../helpers/SsiHelper");
const { createBankTasks } = require("../helpers/BankQueryHelper");
const { createCustomsDueTasks } = require("../helpers/CustomsDueHelper");
const { createTaxDueTasks } = require("../helpers/TaxDueHelper");
const { createPatentTasks } = require("../helpers/PatentHelper");
const { createCreditorCaseTasks } = require("../helpers/CreditorCaseHelper");
const { createNormalAssetTasks } = require("../helpers/NormalAssetHelper");
const { createShareTasks } = require("../helpers/ShareHelper");
const BankQueryModel = require("../models/BankQueryModel");
const { Types } = require("mongoose");
const ImmovableModel = require("../models/ImmovableModel");
const NormalAssetModel = require("../models/NormalAssetModel");
const PatentModel = require("../models/PatentModel");
const ShareModel = require("../models/ShareModel");
const SsiModel = require("../models/SsiModel");
const TaxDueModel = require("../models/TaxDueModel");
const VehicleModel = require("../models/VehicleModel");
const { createDeFactoTasks } = require("../helpers/DeFactoHelper");
const {
  createPledgedMovableTasks,
} = require("../helpers/PledgedMovableHelper");
const PledgedMovableModel = require("../models/PledgedMovableModel");

//TODO: bu route için fiili haciz ve receivedAssets durumları düşünülecek !!!
router.put(
  "/:type/:id/restriction/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { type, id, property } = req.params;
    const { propertyValue } = req.body;
    getAssetModelByType(type)
      .findByIdAndUpdate(
        id,
        { [`restriction.${property}`]: propertyValue, lastUpdate: new Date() },
        { new: true }
      )
      .then((asset) => {
        res.send(asset);
        handleRestrictionTasks(req, res, asset, type);

        const customReq = {
          params: { property: `restriction.${property}` },
          body: {},
        };
        if (type === ASSET_TYPE.VEHICLE)
          createVehicleTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.IMMOVABLE)
          createImmovableTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.SSI) createSsiTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.BANK)
          createBankTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.CUSTOMS)
          createCustomsDueTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.TAX_DUE)
          createTaxDueTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.PATENT)
          createPatentTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.CREDITOR_CASE)
          createCreditorCaseTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.SHARE)
          createShareTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.NORMAL_ASSET)
          createNormalAssetTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.DE_FACTO)
          createDeFactoTasks(customReq, res, asset);
        else if (type === ASSET_TYPE.PLEDGED_MOVABLE)
          createPledgedMovableTasks(customReq, res, asset);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/:debtorId/withRestriction",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    Promise.all([
      BankQueryModel.find({ caseId, debtorId }),
      ImmovableModel.find({ caseId, debtorId }),
      NormalAssetModel.find({ caseId, debtorId }),
      PatentModel.find({ caseId, debtorId }),
      ShareModel.find({ caseId, debtorId }),
      SsiModel.find({ caseId, debtorId }),
      TaxDueModel.find({ caseId, debtorId }),
      VehicleModel.find({ caseId, debtorId }),
      PledgedMovableModel.find({ caseId, debtorId }),
    ]).then((results) => {
      res.send({
        bankQueries: results[0],
        immovables: results[1],
        normalAssets: results[2],
        patents: results[3],
        shares: results[4],
        ssis: results[5],
        taxDues: results[6],
        vehicles: results[7],
      });
    });
  }
);

router.get(
  "/copyRestriction/:assetType/:assetId/:targetAssetType/:targetAssetId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { assetType, assetId, targetAssetType, targetAssetId } = req.params;
    getAssetModelByType(assetType)
      .findById(assetId)
      .then((asset) => {
        getAssetModelByType(targetAssetType)
          .findByIdAndUpdate(
            targetAssetId,
            { "restriction.table": asset.restriction.table },
            { new: true }
          )
          .then((targetAsset) => {
            res.send(targetAsset);
          })
          .catch((e) => next(serverError(e)));
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
