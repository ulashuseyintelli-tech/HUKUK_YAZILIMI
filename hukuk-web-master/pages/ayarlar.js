import Layout from '../components/Layout'
import Button from '../components/anBrains/Button'
import { useEffect, useState } from 'react'
import { STATUS } from '../constants'
import { getLawOffices, updateLawOffice } from '../services/lawOfficeService'
import AuthoritySettings from '../components/settings/AuthoritySettings'
import InpoundmentSettings from '../components/settings/InpoundmentSettings'

export default function ayarlar(props) {
	const [status, setStatus] = useState(STATUS.LOADING)
	const [lawOffice, setLawOffice] = useState(null)
	const [selectedSetting, setSelectedSetting] = useState(0)

	useEffect(() => {
		prepare()
	}, [])

	const prepare = async () => {
		await getLawOffice()
		setStatus(STATUS.NORMAL)
	}

	const getLawOffice = async () => {
		await getLawOffices()
			.then(res => {
				setLawOffice(res.data[0])
			})
			.catch(() => alert('Hata'))
	}

	const save = async () => {
		setStatus(STATUS.LOADING)
		await updateLawOffice(lawOffice)
			.then(() => {
				alert('Başarıyla kaydedildi')
			})
			.catch(() => {
				alert('Hata meydana geldi!')
			})
		setStatus(STATUS.NORMAL)
	}

	return (
		<Layout {...props}>
			<div className="container">
				<div className="settings-container">
					<div className="settings-menu">
						<h1 className="mb-4">Ayarlar</h1>
						<Button onClick={() => setSelectedSetting(0)}>Kullanıcılar</Button>
						<Button onClick={() => setSelectedSetting(1)}>Yetkiler</Button>
						<Button onClick={() => setSelectedSetting(2)}>Haciz</Button>
					</div>
					{status === STATUS.NORMAL && (
						<div className="settings-content">
							{selectedSetting === 1 && (
								<AuthoritySettings
									save={save}
									lawOffice={lawOffice}
									setLawOffice={setLawOffice}
								/>
							)}
							{selectedSetting === 2 && (
								<InpoundmentSettings
									save={save}
									lawOffice={lawOffice}
									setLawOffice={setLawOffice}
								/>
							)}
						</div>
					)}
				</div>
			</div>
		</Layout>
	)
}
