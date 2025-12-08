const express = require('express')
const next = require('next')
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
	const server = express()

	server.get('/takip/:number/tebligat', (req, res) => {
		const mergedQuery = Object.assign({}, req.query, req.params)
		return app.render(req, res, '/takip/CaseNotificationDetails', mergedQuery)
	})

	server.get('/takip/:number/haciz', (req, res) => {
		const mergedQuery = Object.assign({}, req.query, req.params)
		return app.render(req, res, '/takip/CaseInpoundmentDetails', mergedQuery)
	})

	server.get('/takip/:number/yazici', (req, res) => {
		const mergedQuery = Object.assign({}, req.query, req.params)
		return app.render(req, res, '/takip/CasePrinter', mergedQuery)
	})

	server.get('/takip/:number/gorevler', (req, res) => {
		const mergedQuery = Object.assign({}, req.query, req.params)
		return app.render(req, res, '/takip/Zekiye', mergedQuery)
	})

	server.get('/gorevler', (req, res) => {
		const mergedQuery = Object.assign({}, req.query, req.params)
		return app.render(req, res, '/gorevler', mergedQuery)
	})

	// This is the default route, don't edit this.
	server.get('*', (req, res) => {
		return handle(req, res)
	})

	const port = process.env.PORT || 3030

	server.listen(port, err => {
		if (err) throw err
		console.log(`> Ready on port ${port}...`)
	})
})
