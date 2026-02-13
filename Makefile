.PHONY: dev dev-frontend dev-backend lint lint-fix format format-check typecheck build install clean help

# Default target
help: ## Show this help message
	@echo "ITOM Chat UI - Development Commands"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development
dev: ## Start both frontend and backend dev servers concurrently
	npm run dev

dev-frontend: ## Start only the Next.js frontend dev server
	npm run dev:frontend

dev-backend: ## Start only the FastAPI backend dev server
	npm run dev:backend

# Code quality
lint: ## Run ESLint on the frontend
	npm run lint

lint-fix: ## Run ESLint with auto-fix on the frontend
	npm run lint:fix

format: ## Format frontend code with Prettier
	npm run format

format-check: ## Check if frontend code is formatted
	npm run format:check

typecheck: ## Run TypeScript type checking
	npm run typecheck

lint-backend: ## Run ruff linter on the backend
	cd backend && .venv/bin/ruff check app/ tests/

format-backend: ## Format backend code with black
	cd backend && .venv/bin/black app/ tests/

check-all: lint format-check typecheck lint-backend ## Run all code quality checks

# Build
build: ## Build the Next.js frontend for production
	npm run build

# Setup
install: ## Install all dependencies (frontend + root)
	cd frontend && npm install
	npm install
	cd backend && uv sync --extra dev

clean: ## Remove build artifacts and caches
	rm -rf frontend/.next frontend/out frontend/node_modules/.cache
	rm -rf backend/.mypy_cache backend/.pytest_cache backend/.ruff_cache
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
