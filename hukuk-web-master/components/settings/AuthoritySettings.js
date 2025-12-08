import React from 'react'
import { FaPlus, FaTrash, FaCheck } from 'react-icons/fa'
import Button from '../anBrains/Button'

export default function AuthoritySettings({ save, lawOffice, setLawOffice }) {
	const removePermission = (userId, index) => {
		const permissionIndex = lawOffice.caseTaskPermissions[index].findIndex(
			item => item === userId,
		)
		lawOffice.caseTaskPermissions[index].splice(permissionIndex, 1)
		setLawOffice({ ...lawOffice })
	}

	const removeDegree = index => {
		lawOffice.caseTaskPermissions.splice(index, 1)
		setLawOffice({ ...lawOffice })
	}

	const setCaseTaskTransitionDays = val => {
		lawOffice.caseTaskTransitionDays = val
		setLawOffice({ ...lawOffice })
	}

	const extractUser = userId => {
		return getUserList().filter(item => item._id === userId)[0]
	}

	const getUserList = () => {
		return [...lawOffice.lawyers, ...lawOffice.users]
	}

	const onClickUser = (userId, index) => {
		if (index || index === 0) {
			if (!lawOffice.caseTaskPermissions[index].includes(userId)) {
				lawOffice.caseTaskPermissions[index].push(userId)
			}
		} else {
			lawOffice.caseTaskPermissions.push([userId])
		}
		setLawOffice({ ...lawOffice })
	}

	const UserList = ({ index }) => {
		return (
			<React.Fragment>
				<p className="bold mb-2">Yetkili Seç</p>
				{getUserList().map(item => {
					return (
						<Button
							theme="basic"
							classes="mb-2 jst-start"
							onClick={() => onClickUser(item._id, index)}
						>
							{item.name} {item.surname}
						</Button>
					)
				})}
			</React.Fragment>
		)
	}

	return (
		<div>
			<div className="flex al-center">
				<h2>Görev Yetki Dereceleri</h2>
				<details className="ml-4">
					<summary>
						<div className="btn btn-blue p-1 fw-500">
							<FaPlus />
						</div>
					</summary>
					<div className="nav-summary">
						<UserList />
					</div>
				</details>
			</div>
			<p>
				Sistem otomatik olarak en alt dereceden görev vermeye başlayacaktır.
			</p>
			{lawOffice.caseTaskPermissions.map((caseTaskPermission, index) => {
				return (
					<div key={index + caseTaskPermission.toString()} className="mt-8">
						<div className="flex al-center mb-4">
							<p className="fw-500 fs-md">{index + 1}. Derece Yetkililer</p>
							<details className="ml-4">
								<summary>
									<div className="btn btn-blue p-1 fw-500">
										<FaPlus className="fs-xsm" />
									</div>
								</summary>
								<div className="nav-summary">
									<UserList index={index} />
								</div>
							</details>
							{index !== 0 && (
								<Button
									theme="red"
									classes="p-1 ml-2"
									onClick={() => removeDegree(index)}
								>
									<FaTrash className="fs-xsm" />
								</Button>
							)}
						</div>
						{caseTaskPermission.map((permission, permissionIndex) => {
							const permissionUser = extractUser(permission)
							return (
								<div key={permission} className="permission-user">
									<p>
										{permissionUser.name} {permissionUser.surname}
									</p>
									<p className="fs-sm">{permissionUser.email}</p>
									{permissionIndex !== 0 && (
										<Button
											classes="red mt-2"
											onClick={() => removePermission(permission, index)}
										>
											Yetkiyi iptal et
										</Button>
									)}
								</div>
							)
						})}
					</div>
				)
			})}
			<Button theme="blue" classes="fw-500 mt-8" onClick={save}>
				<FaCheck className="mr-2" />
				Yetkileri Kaydet
			</Button>
		</div>
	)
}
