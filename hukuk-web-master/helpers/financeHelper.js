import { COUNSEL_FEE_THRESHOLDS, EXACT_EXPENDITURES } from '../constants'

export const calculatePercentage = (amount, percentage) => {
	return (amount * percentage) / 100
}

export const calculateBeforeCaseAmountOfDue = (
	due,
	endDate = new Date(),
	startDate,
) => {
	let amount = 0
	if (due.causeOfDebt !== 'ASIL ALACAK' || due.beforeCaseUsury !== null) {
		const percentage = due.beforeCaseUsury || 13.5
		const dayDiff =
			(endDate - (startDate || new Date(due.expiryDate))) / 86400000
		amount += (due.totalAmount * percentage * dayDiff) / 36500
	}
	return amount
}

export const calculateAfterCaseAmountOfDue = (
	due,
	currentCase,
	endDate = new Date(),
	startDate,
) => {
	let amount = 0
	const percentage = due.afterCaseUsury || 13.5
	const dayDiff =
		(endDate - (startDate || new Date(currentCase.date))) / 86400000
	amount += (due.totalAmount * percentage * dayDiff) / 36500
	return amount
}

export const calculateDueAmount = (due, currentCase) => {
	let amount = due.totalAmount
	amount += calculateBeforeCaseAmountOfDue(due)
	amount += calculateAfterCaseAmountOfDue(due, currentCase)
	return amount
}

export const calculateTotalDueAmount = (dues, currentCase) => {
	let total = 0
	dues.map(due => (total += calculateDueAmount(due, currentCase)))
	return total
}

export const calculateAdvanceFee = caseTotalDue => {
	return (caseTotalDue / 1000) * 5
}

export const calculateInpoundmentFees = (
	caseTotalDue,
	notsExp,
	custExp,
	officialExp,
) => {
	let fees = 0
	EXACT_EXPENDITURES.map(exp => (fees += exp.amount))
	fees += calculateAdvanceFee(caseTotalDue)
	fees += parseInt(notsExp)
	fees += parseInt(custExp)
	fees += parseInt(officialExp)
	return fees
}

export const calculateCounselFee = (
	caseTotalDue,
	thresholdLevel = 0,
	counselFee = 0,
) => {
	if (thresholdLevel < COUNSEL_FEE_THRESHOLDS.length && caseTotalDue > 0) {
		const threshold = COUNSEL_FEE_THRESHOLDS[thresholdLevel]
		thresholdLevel += 1
		counselFee =
			counselFee +
			calculatePercentage(
				caseTotalDue < threshold.amount ? caseTotalDue : threshold.amount,
				threshold.percentage,
			)
		caseTotalDue = caseTotalDue - threshold.amount
		return calculateCounselFee(caseTotalDue, thresholdLevel, counselFee)
	}
	return counselFee
}

export const calculateCollectionFee = totalDueAmount => {
	// return calculatePercentage(totalDueAmount, 4.55)
	return calculatePercentage(totalDueAmount, 4)
}

export const calculateBadCheckFee = dues => {
	let total = 0
	dues
		.filter(due => due.causeOfDebt === 'ÇEK')
		.map(due => (total += due.totalAmount))
	return total / 10
}

export const calculateTotalPayment = payments => {
	let total = 0
	payments.map(p => (total += p.amount))
	return total
}

export const formatMoney = amount => {
	return amount.toLocaleString('tr-TR')
}

export const calculateRemainingDebt = (
	currentCase,
	payments,
	dues,
	custodianInfos,
	notifications,
	expenses,
	currentDate = new Date(),
) => {
	if (dues.length > 0) {
		let debt = 0
		dues.map(due => (debt += due.totalAmount))
		let totalDue = 0
		if (payments.length === 0) {
			totalDue = calculateTotalDueAmount(dues, currentCase)
			debt += calculateAfterCaseAmountOfDue(dues[0], currentCase)
			debt += calculateInpoundmentFees(
				totalDue,
				notifications.expanditure,
				custodianInfos.expanditure,
				expenses?.officialExpanditure,
			)
			debt += calculateBadCheckFee(dues)
		} else {
			const calculatedNotificationIds = []
			const calculatedExpenseIds = []
			let mainMoney = debt
			let remainingExpenses = 0
			EXACT_EXPENDITURES.map(exp => (remainingExpenses += exp.amount))
			remainingExpenses += calculateCounselFee(dues[0].totalAmount)
			remainingExpenses += calculateAdvanceFee(dues[0].totalAmount)
			remainingExpenses += calculateBadCheckFee(dues)
			payments.map((payment, index) => {
				const expenseStartDate =
					index === 0
						? new Date(currentCase.date)
						: new Date(payments[index - 1].date)
				const expenseEndDate = new Date(payment.date)
				remainingExpenses += parseInt(
					calculateAfterCaseAmountOfDue(
						{ ...dues[0], totalAmount: mainMoney },
						currentCase,
						expenseEndDate,
						expenseStartDate,
					),
				)
				notifications.list
					.filter(not => !calculatedNotificationIds.some(n => n === not._id))
					.map(not => {
						if (new Date(not.startDate) <= expenseEndDate) {
							remainingExpenses += parseInt(not.expanditure)
							calculatedNotificationIds.push(not._id)
						}
					})
				expenses?.officialList
					.filter(exp => !calculatedExpenseIds.some(e => e === exp._id))
					.map(exp => {
						if (new Date(exp.startDate) <= expenseEndDate) {
							remainingExpenses += parseInt(exp.expanditure)
							calculatedNotificationIds.push(exp._id)
						}
					})
				custodianInfos.list
					.filter(item => new Date(item.startDate) < expenseEndDate)
					.map(item => {
						const itemStartDate = new Date(item.startDate)
						const itemEndDate = new Date(item.endDate)
						const start =
							itemStartDate > expenseStartDate
								? itemStartDate
								: expenseStartDate
						const end =
							itemEndDate > expenseEndDate ? expenseEndDate : itemEndDate
						const dayDiff = Math.floor((end - start) / 86400000)
						remainingExpenses += dayDiff * parseInt(item.dailyPrice)
					})

				if (remainingExpenses > parseInt(payment.amount)) {
					remainingExpenses -= parseInt(payment.amount)
				} else {
					mainMoney -= parseInt(payment.amount) - parseInt(remainingExpenses)
					remainingExpenses = 0
				}
			})
			const startDate = new Date(payments[payments.length - 1].date)
			const endDate = currentDate

			debt =
				mainMoney +
				remainingExpenses +
				parseInt(calculateBeforeCaseAmountOfDue(dues[0])) +
				parseInt(
					calculateAfterCaseAmountOfDue(
						dues[0],
						currentCase,
						endDate,
						startDate,
					),
				)
			custodianInfos.list
				.filter(item => new Date(item.startDate) < endDate)
				.map(item => {
					const itemStartDate = new Date(item.startDate)
					const itemEndDate = new Date(item.endDate)
					const start = itemStartDate > startDate ? itemStartDate : startDate
					const end = itemEndDate > endDate ? endDate : itemEndDate
					const dayDiff = Math.floor((end - start) / 86400000)
					debt += dayDiff * parseInt(item.dailyPrice)
				})
			notifications.list.map(not => {
				const notDate = new Date(not.startDate)
				if (notDate >= startDate) {
					debt += parseInt(not.expanditure)
				}
			})
		}
		// debt += calculateCollectionFee(dues[0].totalAmount)
		return formatMoney(debt)
	} else {
		return 0
	}
}
