.PHONY: up down logs backend frontend

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

backend:
	cd backend && go run ./cmd/api

frontend:
	cd frontend && npm run dev
