const {
  NOTIFICATION_TYPE,
  NOTIFICATION_STATUS,
  INPOUNDMENT_TYPES,
  TASK_STATUS,
  THIRD_PERSON_REASONS,
  TASK_TYPE,
} = require("../constants");
const NotificationModel = require("../models/NotificationModel");
const FamilyMemberModel = require("../models/FamilyMemberModel");
const SsiModel = require("../models/SsiModel");
const TaxDueModel = require("../models/TaxDueModel");
const PatentModel = require("../models/PatentModel");
const CreditorCaseModel = require("../models/CreditorCaseModel");
const BankQueryModel = require("../models/BankQueryModel");
const VehicleModel = require("../models/VehicleModel");
const ImmovableModel = require("../models/ImmovableModel");
const ShareModel = require("../models/ShareModel");
const DeFactoModel = require("../models/DeFactoModel");
const CustomsDueModel = require("../models/CustomsDueModel");
const DebtorModel = require("../models/DebtorModel");
const NormalAssetModel = require("../models/NormalAssetModel");
const PledgedMovableModel = require("../models/PledgedMovableModel");

const $ = TASK_TYPE;

const createAssetNotification = (
  res,
  asset,
  assetType,
  notificationType,
  customFirstLevelObject,
  customAddress
) => {
  const { caseId, debtorId } = customFirstLevelObject || asset;
  DebtorModel.findById(debtorId).then(async (debtor) => {
    let address = customAddress;
    if (!address) {
      if (
        notificationType === NOTIFICATION_TYPE.SHARE ||
        notificationType === NOTIFICATION_TYPE.GARNISHMENT
      ) {
        const thirdPersonId = asset.companyId;
        await DebtorModel.findById(thirdPersonId).then((thirdPerson) => {
          address = thirdPerson.addresses[0];
        });
      } else if (
        debtor.thirdPersonReasons.includes(THIRD_PERSON_REASONS.BANK)
      ) {
        address = debtor.addresses[0];
      } else {
        await NotificationModel.findOne({
          caseId,
          debtorId,
          type: NOTIFICATION_TYPE.CASE_INITIALIZATION,
          status: NOTIFICATION_STATUS.DONE,
        })
          .then((completedNotification) => {
            address = completedNotification.address;
          })
          .catch((e) => console.log(e));
      }
    }
    if (address) {
      const notificationObject = {
        caseId,
        debtorId,
        type: notificationType,
        assetType,
        assetId: asset._id,
        address,
      };
      NotificationModel.find(notificationObject)
        .then((notifications) => {
          NotificationModel.create({
            ...notificationObject,
            level: notifications.length + 1,
          })
            .then((notification) => {
              require("../helpers/NotificationHelper").handleNotificationTasks(
                { body: {}, params: {} },
                res,
                notification
              );
            })
            .catch((e) => console.log(e));
        })
        .catch((e) => console.log(e));
    }
  });
};

const getAssetModelByType = (assetType) => {
  if (assetType === "VEHICLE" || assetType === INPOUNDMENT_TYPES.VEHICLE) {
    return VehicleModel;
  } else if (
    assetType === "IMMOVABLE" ||
    assetType === INPOUNDMENT_TYPES.IMMOVABLE
  ) {
    return ImmovableModel;
  } else if (assetType === "SHARE" || assetType === INPOUNDMENT_TYPES.SHARE) {
    return ShareModel;
  } else if (
    assetType === "DE_FACTO" ||
    assetType === INPOUNDMENT_TYPES.DE_FACTO
  ) {
    return DeFactoModel;
  } else if (
    assetType === "CUSTOMS" ||
    assetType === INPOUNDMENT_TYPES.CUSTOMS
  ) {
    return CustomsDueModel;
  } else if (
    assetType === "FAMILY_REGISTER" ||
    assetType === INPOUNDMENT_TYPES.FAMILY_REGISTER
  ) {
    return FamilyMemberModel;
  } else if (assetType === "SSI" || assetType === INPOUNDMENT_TYPES.SSI) {
    return SsiModel;
  } else if (
    assetType === "TAX_DUE" ||
    assetType === INPOUNDMENT_TYPES.TAX_DUE
  ) {
    return TaxDueModel;
  } else if (assetType === "PATENT" || assetType === INPOUNDMENT_TYPES.PATENT) {
    return PatentModel;
  } else if (
    assetType === "CREDITOR_CASE" ||
    assetType === INPOUNDMENT_TYPES.CREDITOR_CASE
  ) {
    return CreditorCaseModel;
  } else if (assetType === "BANK" || assetType === INPOUNDMENT_TYPES.BANK) {
    return BankQueryModel;
  } else if (assetType === "NORMAL_ASSET") {
    return NormalAssetModel;
  } else if (assetType === "PLEDGED_MOVABLE") {
    return PledgedMovableModel;
  }
};

module.exports = {
  createAssetNotification,
  getAssetModelByType,
};
