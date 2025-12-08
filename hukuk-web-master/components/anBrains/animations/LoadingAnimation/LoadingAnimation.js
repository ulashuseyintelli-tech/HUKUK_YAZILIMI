import React from 'react'
import './loadingAnimation.scss'
import { STATUS } from '../../../../constants'

export default function LoadingAnimation({ status, loading }) {
	if (status === STATUS.LOADING || loading) {
		return (
			<div className="loading-modal">
				<div className="boxes">
					<div className="box">
						<div></div>
						<div></div>
						<div></div>
						<div></div>
					</div>
					<div className="box">
						<div></div>
						<div></div>
						<div></div>
						<div></div>
					</div>
					<div className="box">
						<div></div>
						<div></div>
						<div></div>
						<div></div>
					</div>
					<div className="box">
						<div></div>
						<div></div>
						<div></div>
						<div></div>
					</div>
				</div>
			</div>
		)
	} else return null
}
