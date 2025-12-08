import Axios from "axios";
import { LAW_OFFICE_URL, headerWithToken } from "../config";

export const getLawOffices = () => {
  return Axios.get(LAW_OFFICE_URL, headerWithToken());
};

export const createLawOffice = lawOffice => {
  return Axios.post(LAW_OFFICE_URL, lawOffice, headerWithToken());
};

export const updateLawOffice = lawOffice => {
  return Axios.put(
    `${LAW_OFFICE_URL}/${lawOffice._id}`,
    lawOffice,
    headerWithToken()
  );
};
