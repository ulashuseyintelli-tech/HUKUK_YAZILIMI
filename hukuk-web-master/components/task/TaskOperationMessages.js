import React, { useEffect, useState } from 'react'
import { useSocketContext } from '../../services/socket'
import LottieAnimation from '../anBrains/animations/LottieAnimation'
import complete from '../../public/animations/complete.json'
import notification from '../../public/animations/notification.json'
import { FaTimes } from 'react-icons/fa'
import { useAppContext } from '../../services/hooks/useAppContext'
import { getTaskTextByType } from '../../helpers/taskHelper'
export default function TaskOperationMessages() {
	const { user } = useAppContext()
	const socket = useSocketContext()
	const [messages, setMessages] = useState([])

	useEffect(() => {
		if (socket && user) {
			socket.on(`${user.lawOfficeId} task`, data => {
				createMessage(data[0])
			})
			return () => {
				socket.off(`${user.lawOfficeId} task`)
			}
		}
	}, [socket, user])

	const createMessage = message => {
		const id = messages.length ? messages[messages.length - 1].id + 1 : 1
		messages.push({
			...message,
			id,
		})
		setMessages([...messages])
		setTimeout(async () => deleteMessage(id), 5000)
	}

	const deleteMessage = id => {
		const index = messages.findIndex(m => m.id === id)
		messages.splice(index, 1)
		setMessages([...messages])
	}

	return (
		<div className="task-operation-messages">
			{messages.map((msg, index) => {
				return (
					<div
						className="task-operation__message"
						key={msg.task[0]._id + index}
					>
						<div className="mr-4" style={{ width: 40, height: 40 }}>
							<LottieAnimation
								animationData={
									msg.operationType === 'update' ? complete : notification
								}
								width={40}
								height={40}
							/>
						</div>
						<p>
							{getTaskTextByType(msg.task[0])} görevi{' '}
							{msg.operationType === 'insert' && 'oluşturuldu!'}
							{msg.operationType === 'update' && 'tamamlandı'}
						</p>
						<button onClick={() => deleteMessage(msg.id)}>
							<FaTimes />
						</button>
					</div>
				)
			})}
		</div>
	)
}
