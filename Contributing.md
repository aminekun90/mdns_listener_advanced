# Contributing

Thank you for taking the time to contribute to this project ❤️  
Contributions of all kinds are welcome: bug reports, feature requests, documentation improvements, and code.

Please read this guide before opening an issue or submitting a pull request.

---

## Ways To Contribute

- Open an Issue or Submit a Pull Request check the rules below
- Donate to this or future project via [![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/paypalme/aminebouzahar)

---

## Before You Start

- Check existing issues before creating a new one.
- For significant changes (new features, refactors, breaking changes), open an issue first to discuss the proposal.
- Be respectful and constructive in all interactions. This project follows a Code of Conduct.

---

## Development Setup

### Requirements

- Node.js >= 22 (LTS) use nvm and run `nvm install $(cat .nvmrc)`
- [yarn (not npm)](https://classic.yarnpkg.com/lang/en/docs/install)
- Git of course

### Install dependencies

```sh
yarn install
```

### Run the project example.ts locally

```sh
yarn start
```

### Run tests

```sh
yarn test
```

### Build the project

```sh
yarn build
```

### Pack to tgz

```sh
yarn pack
```

---

## Branching Strategy

- Create branches from main ``git checkout -b <name>``
- Use clear and descriptive branch names:
- feat/add-new-option
- fix/cli-crash
- docs/update-readme
- chore/update-deps

---

## Pull Request Process

1. Ensure your code builds successfully and all tests pass.
2. Follow the existing code style and TypeScript strict rules.
3. Update README.md if your changes affect:
   - Public API
   - CLI options
   - Configuration
4. Do not manually bump versions unless explicitly requested.
5. Open a pull request against the main branch.
6. A pull request may be merged once it has been reviewed and approved by an approved maintainer or owner.

---

## Commit Message Guidelines

Commit Message Guidelines

### Examples

```sh
"feat: add support for custom registry"
"fix: prevent infinite retry loop"
"docs: update contributing guide"
"chore: update dependencies"
```

### Common errors

If you encounter the following error:

```sh
Error: Cannot find module "@commitlint/config-conventional"
```

Install commitlint globally:

```sh
npm install -g @commitlint/cli @commitlint/config-conventional
```

---

## Versioning

This project follows Semantic Versioning (SemVer):

- **MAJOR** – breaking changes
- **MINOR** – backward-compatible features
- **PATCH** – bug fixes

Releases are handled automatically.

---

## Code Style & Quality

- TypeScript strict mode is enabled
- eslint and prettier are configured
- Prefer clarity over cleverness
- Keep functions small and focused
- Add/Update unit tests when fixing bugs or adding features
- Avoid unnecessary dev dependencies as of today we aim to have 0 prod dependencies

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone, regardless of age, gender identity or expression, sexual orientation, disability, ethnicity, religion, or level of experience.

---

## Acceptable Behavior

- Using welcoming language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive feedback
- Focusing on what is best for the community
- Showing empathy towards other community members

---

## Unacceptable Behavior

- Harassment, discrimination, or hate speech
- Trolling, insulting, or derogatory comments
- Sexualized language or imagery
- Publishing private information without explicit permission

---

## Enforcement

Instances of abusive or unacceptable behavior may be reported to the project maintainers.

All reports will be reviewed and handled in a fair and confidential manner.

---

## Thank You

Thank you for helping improve this project 🚀

Your contributions are genuinely appreciated.

Thanks to [All Contributors](https://github.com/aminekun90/mdns-listener-advanced/graphs/contributors)

Thanks to all Donators :

- [**@aminekun90**](https://github.com/aminekun90)
- ...TBD

Have a great day!
