import Axios from "axios";
import { DEBTOR_URL } from "../config";

export const getPDFData = () => {
  return Axios.get(`${DEBTOR_URL}/pdf`);
};
