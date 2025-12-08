# node-starter
Starter pack for Nodejs API

## Whats included
- MongoDB connection
- Input Validations
- Authentication
- Rate limits

## Prerequisites
Make sure installed,
- Mongo DB,
- npm nodemon and pm2 packages,

on your machine.

## Installing
First, clone repository.
```
git clone https://github.com/ook0/node-starter.git
```
Then install dependencies.
```
npm install
```
## Before Start
- [Edit DB_URL:](/config.js) Url for Mongo DB connection.

## Start
For development:
```
nodemon app
```
For production:
```
pm2 start app
```
