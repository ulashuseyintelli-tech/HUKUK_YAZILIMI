import React, { createContext, useEffect, useState } from 'react'
import Head from 'next/head'
import '../public/style/app.scss'
import { checkUser } from '../services/userService'
import Tasker from '../components/Tasker'
import 'react-datepicker/src/stylesheets/datepicker.scss'
import TaskOperationMessages from '../components/task/TaskOperationMessages'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import { AppContext } from '../services/hooks/useAppContext'
import { SocketContext, useSocket } from '../services/socket'

function MyApp({ Component, pageProps }) {
	const [user, setUser] = useState(null)
	const [userLoading, setUserLoading] = useState(true)
	const [tasks, setTasks] = useState([])
	const [tasksOpen, setTasksOpen] = useState(false)

	const socket = useSocket()

	useEffect(() => {
		load()
	}, [])
	const load = async () => {
		await checkAuthentication()
		socket.on('connect', () => {})
	}

	const checkAuthentication = async () => {
		await checkUser().then(res => {
			setUser(res.user)
			setUserLoading(false)
		})
	}

	const authenticate = ({ user, token }) => {
		setUser(user)
		localStorage.setItem('authToken', token)
	}

	if (!user) {
		return <LoadingAnimation />
	}
	return (
		<AppContext.Provider value={{ user, setUser }}>
			<SocketContext.Provider value={socket}>
				<Head>
					<title>Telli Hukuk Bürosu</title>
					<meta
						name="viewport"
						content="width=device-width, initial-scale=1.0"
					/>
				</Head>
				<Tasker
					isOpen={tasksOpen}
					handleOpen={() => setTasksOpen(!tasksOpen)}
				/>
				<TaskOperationMessages />
				<Component
					authenticate={authenticate}
					{...{ user, userLoading, tasksOpen }}
					setTasksOpen={val => setTasksOpen(val)}
					handleTasksOpen={() => setTasks(!tasksOpen)}
					{...pageProps}
				/>
			</SocketContext.Provider>
		</AppContext.Provider>
	)
}

export default MyApp
