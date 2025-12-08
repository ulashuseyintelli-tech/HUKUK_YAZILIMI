import Axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import * as config from '../../config'
import { STATUS } from '../../constants'
import { updateBankQuery } from '../bankQueryService'
import { updateCreditorCase } from '../creditorCaseService'
import { updateCustomsDue } from '../customsDueService'
import { updateDeFacto } from '../deFactoService'
import { updateImmovable } from '../immovableService'
import { updatePatent } from '../patentService'
import { updateShare } from '../shareService'
import { updateSsi } from '../ssiService'
import { updateTaxDue } from '../taxDueService'
import { updateVehicle } from '../vehicleService'
import { updateFamilyRegister } from '../familyRegisterService'

import { useCollection } from './useCollection'
import { updateNormalAsset } from '../normalAssetService'
import { useSocket } from '../socket'
import { updateAssetRestriction } from '../assetService'
import Router from 'next/router'
import { updatePledgedMovable } from '../pledgedMovableService'

export const useAssets = (
	currentCase,
	selectedQueryId,
	assetType,
	queryAssetId,
	debtorId,
	debtorTasks,
) => {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [assets, setAssets] = useState([])
	const [currentStep, setCurrentStep] = useState(0)

	const assetsRef = useRef()

	useEffect(() => {
		assetsRef.current = assets
	}, [assets])

	const {
		loading: collectionsLoading,
		collections,
		setCollections,
	} = useCollection(visibleAssetId)

	const visibleAssetId = queryAssetId === 'null' ? null : queryAssetId
	const setVisibleAssetId = id => {
		return Router.push(
			`/takip/${currentCase?.number}/haciz?debtorId=${debtorId}&assetType=${assetType}&assetId=${id}`,
		)
	}

	useEffect(() => {
		if (assetType !== 'DE_FACTO' || selectedQueryId) {
			if (debtorId && assetType) {
				load()
			}
		}
	}, [assetType, selectedQueryId, queryAssetId])

	useEffect(() => {
		if (assetType !== 'DE_FACTO' || selectedQueryId) {
			if (debtorId && assetType) {
				load()
			}
		}
	}, [debtorId])

	useEffect(() => {
		watchVisibleAssetChanges()
		return () => {
			unwatchVisibleAssetChanges()
		}
	}, [visibleAssetId])

	const socket = useSocket()

	const watchVisibleAssetChanges = () => {
		socket.on(`${visibleAssetId} reload`, setVisibleAsset)
	}

	const setVisibleAsset = data => {
		const currentAssets = assetsRef.current
		const index = currentAssets.findIndex(a => a._id === visibleAssetId)
		currentAssets[index] = data.doc
		setAssets([...currentAssets])
	}

	const unwatchVisibleAssetChanges = () => {
		socket.off(`${visibleAssetId} reload`)
	}

	const load = async () => {
		setStatus(STATUS.LOADING)
		await fetch()
		setStatus(STATUS.NORMAL)
	}

	const fetch = async () => {
		await getAssetList()
			.then(res => {
				setAssets(res.data)
			})
			.catch(e => alert('Hata'))
	}

	const getAssetList = () => {
		let url = ''
		switch (assetType) {
			case 'VEHICLE':
				url += `${config.VEHICLE_URL}`
				break
			case 'SSI':
				url += `${config.SSI_URL}`
				break
			case 'TAX_DUE':
				url += `${config.TAX_DUE_URL}`
				break
			case 'CUSTOMS':
				url += `${config.CUSTOMS_DUE_URL}`
				break
			case 'IMMOVABLE':
				url += `${config.IMMOVABLE_URL}`
				break
			case 'SHARE':
				url += `${config.SHARE_URL}`
				break
			case 'CREDITOR_CASE':
				url += `${config.CREDITOR_CASE_URL}`
				break
			case 'PATENT':
				url += `${config.PATENT_URL}`
				break
			case 'DE_FACTO':
				url += `${config.DE_FACTO_URL}`
				break
			case 'BANK':
				url += `${config.BANK_QERY_URL}`
				break
			case 'FAMILY_REGISTER':
				url += `${config.FAMILY_MEMBER_URL}`
				break
			case 'NORMAL_ASSET':
				url += `${config.NORMAL_ASSET_URL}`
				break
			case 'PLEDGED_MOVABLE':
				url += `${config.PLEDGED_MOVABLE_URL}`
				break
		}
		if (assetType === 'DE_FACTO') {
			url += `/${selectedQueryId}`
		} else {
			url += `/${currentCase._id}/byDebtor/${debtorId}`
		}
		return Axios.get(url, config.headerWithToken())
	}

	const createAsset = async asset => {
		setStatus(STATUS.LOADING)
		await createAssetRequest(asset)
			.then(res => {
				assets.unshift(res.data)
				setAssets([...assets])
				setVisibleAssetId(res.data._id)
			})
			.catch(e => {
				console.log(e)
				alert('Hata')
			})
	}

	const createAssetRequest = asset => {
		let url = ''
		switch (assetType) {
			case 'VEHICLE':
				url += `${config.VEHICLE_URL}`
				break
			case 'SSI':
				url += `${config.SSI_URL}`
				break
			case 'TAX_DUE':
				url += `${config.TAX_DUE_URL}`
				break
			case 'CUSTOMS':
				url += `${config.CUSTOMS_DUE_URL}`
				break
			case 'IMMOVABLE':
				url += `${config.IMMOVABLE_URL}`
				break
			case 'SHARE':
				url += `${config.SHARE_URL}`
				break
			case 'CREDITOR_CASE':
				url += `${config.CREDITOR_CASE_URL}`
				break
			case 'PATENT':
				url += `${config.PATENT_URL}`
				break
			case 'DE_FACTO':
				url += `${config.DE_FACTO_URL}`
				break
			case 'FAMILY_REGISTER':
				url += `${config.FAMILY_MEMBER_URL}`
				break
			case 'NORMAL_ASSET':
				url += `${config.NORMAL_ASSET_URL}`
				break
			case 'PLEDGED_MOVABLE':
				url += `${config.PLEDGED_MOVABLE_URL}`
				break
		}
		if (assetType === 'NORMAL_ASSET') {
			url += `/${currentCase._id}/${debtorId}`
		} else if (assetType === 'DE_FACTO') {
			url += `/${selectedQueryId}`
		} else {
			url += `/${currentCase._id}/${debtorId}/${selectedQueryId}`
		}
		return Axios.post(url, asset, config.headerWithToken())
	}

	const updateAsset = async (prop, val) => {
		const index = assets.findIndex(a => a._id === visibleAssetId)
		await getAssetUpdateFunc(assetType)(assets[index]._id, prop, val)
			.then(res => {
				assets[index] = res.data
				setAssets([...assets])
			})
			.catch(e => alert('Hata'))
	}

	const getAssetUpdateFunc = assetType => {
		switch (assetType) {
			case 'VEHICLE':
				return updateVehicle
			case 'SSI':
				return updateSsi
			case 'TAX_DUE':
				return updateTaxDue
			case 'CUSTOMS':
				return updateCustomsDue
			case 'IMMOVABLE':
				return updateImmovable
			case 'SHARE':
				return updateShare
			case 'CREDITOR_CASE':
				return updateCreditorCase
			case 'PATENT':
				return updatePatent
			case 'DE_FACTO':
				return updateDeFacto
			case 'BANK':
				return updateBankQuery
			case 'FAMILY_REGISTER':
				return updateFamilyRegister
			case 'NORMAL_ASSET':
				return updateNormalAsset
			case 'PLEDGED_MOVABLE':
				return updatePledgedMovable
		}
	}

	const updateRestriction = (prop, val) => {
		const index = assets.findIndex(a => a._id === visibleAssetId)
		return updateAssetRestriction(assetType, visibleAssetId, prop, val)
			.then(res => {
				assets[index] = res.data
				setAssets([...assets])
			})
			.catch(e => alert('Hata'))
	}

	const checkTasksIncludes = (
		taskType,
		tasks,
		extraCondition,
		customAssetId,
	) => {
		tasks = tasks || debtorTasks
		return debtorTasks.some(t => {
			return (
				new Date(t.startDate) < new Date() &&
				t.type === taskType &&
				t.assetId ===
					(customAssetId === undefined ? visibleAssetId : customAssetId) &&
				(extraCondition ? extraCondition(t) : true)
			)
		})
	}

	return {
		status,
		setStatus,
		assetsLoading: status === STATUS.LOADING,
		visibleAsset: assets.find(a => a._id === visibleAssetId),
		visibleAssetIndex: assets.findIndex(a => a._id === visibleAssetId),
		assets,
		setAssets,
		visibleAssetId,
		setVisibleAssetId,
		collectionsLoading,
		collections,
		setCollections,
		updateAsset,
		createAsset,
		currentStep,
		setCurrentStep,
		checkTasksIncludes,
		assetType,
		updateRestriction,
	}
}
