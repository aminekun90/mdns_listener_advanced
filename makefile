# MakeFile used to install project for dev env
install:
	npm install -g @commitlint/config-conventional @commitlint/cli
	yarn install
start:
	yarn start
build:
	yarn build
lint:
	yarn lint
lint-fix:
	yarn lint --fix
