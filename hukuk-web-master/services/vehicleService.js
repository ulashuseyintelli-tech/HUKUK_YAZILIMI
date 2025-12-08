import { VEHICLE_URL, headerWithToken } from '../config'
import Axios from 'axios'

export const createVehicle = (
	caseId,
	debtorId,
	vehicle,
	queryId,
	withoutTasks,
) => {
	const url = `${VEHICLE_URL}/${caseId}/${debtorId}/${queryId}?withoutTasks=${withoutTasks}`
	return Axios.post(url, vehicle, headerWithToken())
}

export const updateVehicle = (vehicleId, property, propertyValue) => {
	const url = `${VEHICLE_URL}/${vehicleId}/${property}`
	return Axios.put(url, { propertyValue }, headerWithToken())
}

export const getVehicleById = vehicleId => {
	const url = `${VEHICLE_URL}/${vehicleId}`
	return Axios.get(url, headerWithToken())
}

export const getVehiclesByDebtorId = debtorId => {
	const url = `${VEHICLE_URL}/byDebtor/${debtorId}`
	return Axios.get(url, headerWithToken())
}
