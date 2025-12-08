import { ActiveLink } from './anBrains/ActiveLink'
import {
	FaBell,
	FaGavel,
	FaBriefcase,
	FaFolderPlus,
	FaUserFriends,
	FaCog,
} from 'react-icons/fa'
import Button from './anBrains/Button'
import Link from 'next/link'
import useHeightWithoutHeader from '../services/hooks/useHeightWithoutCaseNav'
import CaseForm from './forms/CaseForm'

export default function Layout(props) {
	const { user, children, handleTasksOpen } = props

	const { height } = useHeightWithoutHeader()

	return (
		<div className="layout">
			<header className="header" id="header">
				<div className="container">
					<div className="logo">
						<Link href="/takipler">
							<a>
								<FaGavel />
								<h1>Telli Hukuk</h1>
							</a>
						</Link>
					</div>
					<div className="nav">
						<ActiveLink href="/takipler">
							<FaBriefcase />
							Takipler
						</ActiveLink>
						<CaseForm />
						<details>
							<summary>
								<FaUserFriends />
								Taraflar
							</summary>
							<div className="nav-summary">
								<ActiveLink href="/avukatlar">Avukatlar</ActiveLink>
								<ActiveLink href="/muvekkiller">Müvekkiller</ActiveLink>
								<ActiveLink href="/borclular">Borçlular</ActiveLink>
							</div>
						</details>
						<ActiveLink href="/ayarlar">
							<FaCog />
							Ayarlar
						</ActiveLink>
					</div>
					{user && (
						<div className="header-user">
							<Link href="/gorevler">
								<a className="tasks-bell">
									<FaBell />
									<p>Görevler</p>
								</a>
							</Link>
							<Button classes="header-user-card">
								<img src="https://i.pinimg.com/originals/a2/de/39/a2de3954697c636276192afea0a6f661.jpg" />
								<p className="fw-500">
									{user.name} {user.surname}
								</p>
							</Button>
						</div>
					)}
				</div>
			</header>
			<div className="content" style={{ marginTop: height }}>
				{children}
			</div>
			<footer className="footer"></footer>
		</div>
	)
}
