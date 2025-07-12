---
applyTo: '**'
---

Coding standards, domain knowledge, and preferences that AI should follow

# UDI JavaScript Coding Standards and Practices

This document outlines the coding standards, domain knowledge, and preferences
for the UDI JavaScript project. It is designed to ensure consistency,
maintainability, and quality across the codebase.

# General Coding Standards

## 1. Code Style

- Use **Prettier** for code formatting.
- Follow the **Airbnb JavaScript Style Guide** for JavaScript and TypeScript.
- Use **ESLint** for linting with the following rules:
  - No unused variables or imports.
  - No console statements in production code.
  - Use `const` for constants and `let` for variables that will change.
- Use **TypeScript** for type safety and better tooling support.

## 2. Naming Conventions

- Use **camelCase** for variables and function names (e.g., `myVariable`,
  `calculateTotal`).
- Use **PascalCase** for class names and React components (e.g., `MyComponent`,
  `UserProfile`).
- Use **UPPER_SNAKE_CASE** for constants (e.g., `MAX_RETRIES`, `API_URL`).
- Use descriptive names that clearly indicate the purpose of the variable or
  function.
- Use prefixes for boolean variables (e.g., `isActive`, `hasPermission`).
- Use suffixes for event handlers (e.g., `onClick`, `onChange`).
- Use plural names for arrays (e.g., `users`, `items`).
- Use singular names for objects (e.g., `user`, `item`).'

## 3. Comments and Documentation

- Use JSDoc comments for functions, classes, and complex logic.
- Write clear and concise comments explaining the purpose of the code.
- Use TODO comments for unfinished work or areas that need improvement.
- Use FIXME comments for known issues that need to be addressed.
- Use descriptive commit messages that explain the changes made.
- Use the present tense in commit messages (e.g., "Fixes bug", "Adds feature").
- Use **typedoc** for generating documentation from JSDoc comments.

## 4. Error Handling

- Use `try-catch` blocks for error handling in asynchronous code.
- Use custom error classes for specific error types (e.g., `NetworkError`,
  `ValidationError`).
- Log errors using **winston**
- Avoid using `console.error` directly; use a logging library instead.

## 5. Code Structure

- Organize code into modules and packages.
- Use a consistent folder structure across the project.
- Group related files together (e.g., components, utilities, services).
- Use index files to simplify imports (e.g., `export * from './MyComponent';`).
- Keep files small and focused on a single responsibility.

## 6. Testing

- Use **Mocha** for unit testing.
- Write tests for all public functions and components.
- Use **React Testing Library** for testing React components.
- Use **Cypress** for end-to-end testing.
- Follow the **Arrange-Act-Assert** pattern for writing tests.

## 7. Version Control

- Use **Git** for version control.
- Use a consistent branching strategy (e.g., `main`, `develop`, `feature/*`,
  `bugfix/*`).
- Use pull requests for code reviews and merging changes.
- Write clear and descriptive pull request titles and descriptions.

## 8. Dependencies

- Use **npm** for package management.
- Keep dependencies up to date.
- Use **npm audit** to check for vulnerabilities in dependencies.
- Avoid using deprecated or unmaintained packages.

## 9. Performance

- Use **Lighthouse** to analyze performance and accessibility.
- Optimize images and assets.
- Use lazy loading for large components and routes.
- Avoid unnecessary re-renders in React components.

## 10. Security

- Use **Helmet** for securing HTTP headers in Express applications.
- Use **dotenvx** for managing environment variables.
- Validate and sanitize user input to prevent XSS and SQL injection attacks.
- Use HTTPS for secure communication.

## 11. Code Generation and Automation

- All code generation tools/scripts must be written in TypeScript, type-checked,
  and linted.
- Generated code must always be formatted with Prettier and pass all ESLint
  rules.
- Any changes to codegen logic/templates must be reviewed by inspecting the
  output for at least one representative device/class.
- Generated code must never include `// eslint-disable` or `@ts-ignore` comments
  except in rare, justified cases with a TODO and explanation.

## 12. AI and Copilot Usage

- Copilot and other AI tools must always generate code that is type-safe,
  documented, and idiomatic.
- AI-generated code must never bypass linting or type checks.
- When generating or updating codegen logic, always ensure the output matches
  the standards above.

#
