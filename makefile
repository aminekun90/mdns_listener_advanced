# MakeFile used to install project for dev env
install:
	npm install -g @commitlint/config-conventional @commitlint/cli 
	npm ci
start:
	npm start
test:
	npm run test
build:
	npm run build
lint:
	npx eslint ./
lint-fix:
	npx eslint ./ --fix