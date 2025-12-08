import Axios from 'axios'
import { TASK_URL, headerWithToken } from '../config'
import { TASK_SORT_OPTIONS, TASK_STATUS } from '../constants'

export const getTasks = status => {
	return Axios.get(`${TASK_URL}/${status}`, headerWithToken())
}

export const cancelTask = (taskId, causeOfCancel) => {
	const url = `${TASK_URL}/${taskId}/cancel`
	return Axios.put(url, { causeOfCancel }, headerWithToken())
}

export const extendTask = (taskId, extensionDays, causeOfExtension) => {
	const url = `${TASK_URL}/${taskId}/extend`
	return Axios.put(url, { extensionDays, causeOfExtension }, headerWithToken())
}

export const getTasksByCaseNumber = (caseNumber, statuses) => {
	const url = `${TASK_URL}/case/${caseNumber}?statuses=${statuses}`
	return Axios.get(url, headerWithToken())
}

export const getTaskById = taskId => {
	const url = `${TASK_URL}/byId/${taskId}`
	return Axios.get(url, headerWithToken())
}

export const getFutureTask = (assetType, assetId, type) => {
	const url = `${TASK_URL}/future/${assetType}/${assetId}`
	return Axios.get(url, headerWithToken())
}

export const getTaskStatistics = () => {
	const url = `${TASK_URL}/statistics`
	return Axios.get(url, headerWithToken())
}

export const getTodayTasks = () => {
	const url = `${TASK_URL}/today`
	return Axios.get(url, headerWithToken())
}

export const getOverdueTasks = () => {
	const url = `${TASK_URL}/overdue`
	return Axios.get(url, headerWithToken())
}

export const getDebtorTasksByCase = (caseId, debtorId) => {
	const url = `${TASK_URL}/${caseId}/byDebtor/${debtorId}`
	return Axios.get(url, headerWithToken())
}

export const getTasksByFilters = (
	sortBy = TASK_SORT_OPTIONS.DUE_DATE.value,
	status = TASK_STATUS.PENDING,
	debtorId,
	caseId,
	type,
) => {
	let url = `${TASK_URL}/byOptions?sortBy=${sortBy}&status=${status}`
	if (debtorId) {
		url += `&debtorId=${debtorId}`
	}
	if (caseId) {
		url += `&caseId=${caseId}`
	}
	if (type) {
		url += `&type=${type}`
	}
	return Axios.get(url, headerWithToken())
}

export const getTasksForTasker = (debtorId, caseId) => {
	let url = `${TASK_URL}/tasker?a=1`
	if (debtorId) url += `&debtorId=${debtorId}`
	if (caseId) url += `&caseId=${caseId}`
	return Axios.get(url, headerWithToken())
}

export const getDebtorDoneCaseInitializationTasks = (caseId, debtorId) => {
	const url = `${TASK_URL}/byCase/${caseId}/byDebtor/${debtorId}/caseInitialization`
	return Axios.get(url, headerWithToken())
}

export const getCollectionTasks = assetId => {
	const url = `${TASK_URL}/collection/${assetId}`
	return Axios.get(url, headerWithToken())
}

export const getDeFactoPreparingTasks = () => {
	const url = `${TASK_URL}/deFacto/preparing`
	return Axios.get(url, headerWithToken())
}

export const getDeFactoIntelTasks = () => {
	const url = `${TASK_URL}/deFacto/intel`
	return Axios.get(url, headerWithToken())
}
