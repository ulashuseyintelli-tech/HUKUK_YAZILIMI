import Input from '../anBrains/Input'
import { useState } from 'react'
import { cities, getDistrictsByCity } from '../../services/cities'
import Modal from '../anBrains/Modal'
import Button from '../anBrains/Button'
import { STATUS } from '../../constants'
import {
	createLandRegistryOffice,
	updateLandRegistryOffice,
} from '../../services/landRegistryOfficeServie'

export default function NewLandRegistryOfficeForm({
	close,
	offices,
	setOffices,
	office,
	util,
}) {
	office = office || util

	const [status, setStatus] = useState(STATUS.NORMAL)
	const [name, setName] = useState(office ? office.name : '')
	const [city, setCity] = useState(office ? office.city : cities[0].name)
	const [district, setDistrict] = useState(
		office
			? office.district
			: getDistrictsByCity(cities[0].name)[0].districtName,
	)
	const [notes, setNotes] = useState(office ? office.notes : '')

	const create = e => {
		setStatus(STATUS.LOADING)
		e.preventDefault()
		createLandRegistryOffice({
			name,
			city,
			district,
			notes,
		})
			.then(res => {
				setOffices([res.data, ...offices])
				close()
			})
			.catch(e => alert('Hata'))
		setStatus(STATUS.NORMAL)
	}

	const save = e => {
		setStatus(STATUS.LOADING)
		e.preventDefault()
		updateLandRegistryOffice(office._id, {
			name,
			city,
			district,
			notes,
		})
			.then(res => {
				setOffices([res.data, ...offices])
				close()
			})
			.catch(e => {
				alert('Hata')
				console.log(e)
			})
		setStatus(STATUS.NORMAL)
	}

	return (
		<Modal visible close={() => close()}>
			<form
				className="form-modal case-form__modal column"
				onSubmit={office ? save : create}
			>
				<p className="blue bold mb-4 fs-md">Yeni Tapu Sicil Müdürlüğü</p>
				<label>
					<span className="fw-500">Tapu Sicil Müdürlüğü Adı</span>
					<Input
						placeholder="Tapu Sicil Müdürlüğü Adı"
						classes="mt-2 mb-2"
						value={name}
						onChange={e => setName(e.target.value)}
					/>
				</label>
				<div className="flex al-center mt-2">
					<label className="column w-50 mr-4">
						<span className="fw-500">Tapu Sicil Müdürlüğü İli</span>
						<select
							className="input my-2"
							value={city}
							onChange={e => setCity(e.target.value)}
						>
							{cities.map(city => {
								return (
									<option key={city.name} value={city.name} className="dark">
										{city.name}
									</option>
								)
							})}
						</select>
					</label>
					<label className="column w-50">
						<span className="fw-500">Tapu Sicil Müdürlüğü İlçesi</span>
						<select
							className="input my-2"
							value={district}
							onChange={e => setDistrict(e.target.value)}
						>
							{getDistrictsByCity(city).map(district => {
								return (
									<option
										key={district.name}
										value={district.name}
										className="dark"
									>
										{district.districtName}
									</option>
								)
							})}
						</select>
					</label>
				</div>

				<label>
					<span className="fw-500">Notlar</span>
					<Input
						textarea
						placeholder="Bu Tapu Sicil Müdürlüğü ile ilgili eklemek istediğiniz bir not varsa buraya yazın"
						value={notes}
						classes="mt-2"
						onChange={e => setNotes(e.target.value)}
					/>
				</label>
				<Button type="submit" theme="blue mt-4" classes="bold fs-nm">
					{office?._id ? 'Kaydet' : 'Oluştur'}
				</Button>
			</form>
		</Modal>
	)
}
