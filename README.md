# CRM Gin Next

CRM application built with Go, Gin, PostgreSQL, Docker, and Next.js.

## Stack

- Backend: Go, Gin
- Frontend: Next.js, TypeScript, Tailwind CSS
- Database: PostgreSQL
- Infrastructure: Docker Compose

## Development

```bash
docker compose up --build
```

Services:

- Frontend: http://localhost:3000
- Backend: http://localhost:8081
- API health: http://localhost:8081/api/v1/health
- PostgreSQL: localhost:5435

## Planned Features

- JWT authentication
- Guest login
- Customer management
- Deal management
- Activities
- Tasks
- Dashboard summary
