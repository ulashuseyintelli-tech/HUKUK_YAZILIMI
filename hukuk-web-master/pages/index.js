import { useState, useEffect } from 'react'
import Input from '../components/anBrains/Input'
import Button from '../components/anBrains/Button'
import { signIn } from '../services/userService'
import LoadingAnimation from '../components/anBrains/animations/LoadingAnimation/LoadingAnimation'
import { STATUS } from '../constants'
import { handleError } from '../helpers/Helper'

export default function index({ authenticate, user, userLoading }) {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')

	useEffect(() => {
		if (user) {
			location.href = '/gorevler'
		}
		return
	}, [user])

	const submitForm = e => {
		e.preventDefault()
		signIn(email, password)
			.then(res => authenticate(res.data))
			.catch(handleError)
	}

	return (
		<div className="auth">
			<LoadingAnimation status={STATUS[userLoading ? 'LOADING' : 'NORMAL']} />
			<div className="container">
				<h1 className="ta-center">Telli İcra Yazılımı</h1>
				<form className="auth-form" onSubmit={submitForm}>
					<label>
						<span className="fw-500">Kullanıcı adı</span>
						<Input
							classes="mt-2 mb-4"
							value={email}
							onChange={e => setEmail(e.target.value)}
							name="email"
						/>
					</label>
					<label>
						<span className="fw-500">Parola</span>
						<Input
							classes="mt-2 mb-4"
							value={password}
							onChange={e => setPassword(e.target.value)}
							name="password"
							type="password"
						/>
					</label>
					<Button theme="blue" type="submit" classes="w-100">
						Giriş Yap
					</Button>
				</form>
			</div>
		</div>
	)
}
