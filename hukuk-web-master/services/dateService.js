export const getDayCount = date => {
	const now = new Date()
	date = new Date(date)
	return parseInt((new Date() - date) / 86400000) || 1
}

export const thisEvening = new Date(new Date().setUTCHours(23, 59, 59, 59))
