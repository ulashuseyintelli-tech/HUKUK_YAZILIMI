import {
	NOTIFICATION_STATUS_WITH_OBJECTION,
	NOTIFICATION_STATUS,
} from '../../constants'

export default function NotificationStatus({ change, value, withObjection }) {
	const statuses = withObjection
		? NOTIFICATION_STATUS_WITH_OBJECTION
		: NOTIFICATION_STATUS

	return (
		<div className="flex al-center">
			<select
				value={value}
				className="input mt-4"
				onChange={e => change(e.target.value)}
			>
				{Object.keys(statuses).map((key, index) => {
					return (
						<option key={key + index} value={statuses[key].value}>
							{statuses[key].text}
						</option>
					)
				})}
			</select>
		</div>
	)
}
