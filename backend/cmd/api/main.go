package main

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
)

type app struct {
	db        *sql.DB
	jwtSecret []byte
}

type user struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Email          string     `json:"email"`
	Role           string     `json:"role"`
	IsGuest        bool       `json:"isGuest"`
	GuestExpiresAt *time.Time `json:"guestExpiresAt"`
}

type authResponse struct {
	AccessToken string `json:"accessToken"`
	User        user   `json:"user"`
}

type customer struct {
	ID        string     `json:"id"`
	OwnerID   string     `json:"ownerId"`
	Name      string     `json:"name"`
	Company   *string    `json:"company"`
	Email     *string    `json:"email"`
	Phone     *string    `json:"phone"`
	Status    string     `json:"status"`
	Memo      *string    `json:"memo"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	DeletedAt *time.Time `json:"-"`
}

type customerInput struct {
	Name    string `json:"name"`
	Company string `json:"company"`
	Email   string `json:"email"`
	Phone   string `json:"phone"`
	Status  string `json:"status"`
	Memo    string `json:"memo"`
}

type task struct {
	ID         string     `json:"id"`
	CustomerID *string    `json:"customerId"`
	DealID     *string    `json:"dealId"`
	OwnerID    string     `json:"ownerId"`
	Title      string     `json:"title"`
	DueDate    *string    `json:"dueDate"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
	DeletedAt  *time.Time `json:"-"`
}

type taskInput struct {
	CustomerID string `json:"customerId"`
	DealID     string `json:"dealId"`
	Title      string `json:"title"`
	DueDate    string `json:"dueDate"`
}

type taskStatusInput struct {
	Status string `json:"status"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	jwtSecret := os.Getenv("JWT_ACCESS_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_ACCESS_SECRET is required")
	}

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	if err := ensureSchema(db); err != nil {
		log.Fatal(err)
	}

	application := app{
		db:        db,
		jwtSecret: []byte(jwtSecret),
	}

	router := gin.Default()
	router.Use(corsMiddleware())

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	api := router.Group("/api/v1")
	api.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})
	api.POST("/auth/guest", application.guestLogin)
	api.GET("/auth/me", application.authRequired(), application.me)

	customers := api.Group("/customers", application.authRequired())
	customers.GET("", application.listCustomers)
	customers.POST("", application.createCustomer)
	customers.GET("/:id", application.getCustomer)
	customers.PUT("/:id", application.updateCustomer)
	customers.DELETE("/:id", application.deleteCustomer)

	tasks := api.Group("/tasks", application.authRequired())
	tasks.GET("/today", application.listTodayTasks)
	tasks.POST("", application.createTask)
	tasks.PUT("/:id/status", application.updateTaskStatus)
	tasks.DELETE("/:id", application.deleteTask)

	if err := router.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func (a app) guestLogin(c *gin.Context) {
	expiresAt := time.Now().UTC().Add(24 * time.Hour)

	row := a.db.QueryRow(`
		INSERT INTO users (name, email, role, is_guest, guest_expires_at)
		VALUES ('Guest User', 'guest-' || replace(gen_random_uuid()::text, '-', '') || '@guest.local', 'guest', true, $1)
		RETURNING id::text, name, email, role, is_guest, guest_expires_at
	`, expiresAt)

	currentUser, err := scanUser(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create guest user"})
		return
	}

	token, err := a.createAccessToken(currentUser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create access token"})
		return
	}

	c.JSON(http.StatusCreated, authResponse{
		AccessToken: token,
		User:        currentUser,
	})
}

func (a app) me(c *gin.Context) {
	userIDValue, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	row := a.db.QueryRow(`
		SELECT id::text, name, email, role, is_guest, guest_expires_at
		FROM users
		WHERE id = $1 AND deleted_at IS NULL
	`, userIDValue)

	currentUser, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}
	if currentUser.IsGuest && currentUser.GuestExpiresAt != nil && currentUser.GuestExpiresAt.Before(time.Now().UTC()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "guest session expired"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": currentUser})
}

func (a app) listCustomers(c *gin.Context) {
	userID := c.GetString("userID")

	rows, err := a.db.Query(`
		SELECT id::text, owner_id::text, name, company, email, phone, status, memo, created_at, updated_at, deleted_at
		FROM customers
		WHERE owner_id = $1 AND deleted_at IS NULL
		ORDER BY updated_at DESC, created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load customers"})
		return
	}
	defer rows.Close()

	customers := []customer{}
	for rows.Next() {
		item, err := scanCustomer(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read customer"})
			return
		}
		customers = append(customers, item)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load customers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"customers": customers})
}

func (a app) createCustomer(c *gin.Context) {
	userID := c.GetString("userID")

	input, ok := bindCustomerInput(c)
	if !ok {
		return
	}

	row := a.db.QueryRow(`
		INSERT INTO customers (owner_id, name, company, email, phone, status, memo)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6, NULLIF($7, ''))
		RETURNING id::text, owner_id::text, name, company, email, phone, status, memo, created_at, updated_at, deleted_at
	`, userID, input.Name, input.Company, input.Email, input.Phone, input.Status, input.Memo)

	item, err := scanCustomer(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create customer"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"customer": item})
}

func (a app) getCustomer(c *gin.Context) {
	userID := c.GetString("userID")
	customerID := c.Param("id")

	row := a.db.QueryRow(`
		SELECT id::text, owner_id::text, name, company, email, phone, status, memo, created_at, updated_at, deleted_at
		FROM customers
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
	`, customerID, userID)

	item, err := scanCustomer(row)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "customer not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load customer"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"customer": item})
}

func (a app) updateCustomer(c *gin.Context) {
	userID := c.GetString("userID")
	customerID := c.Param("id")

	input, ok := bindCustomerInput(c)
	if !ok {
		return
	}

	row := a.db.QueryRow(`
		UPDATE customers
		SET name = $3,
			company = NULLIF($4, ''),
			email = NULLIF($5, ''),
			phone = NULLIF($6, ''),
			status = $7,
			memo = NULLIF($8, ''),
			updated_at = now()
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
		RETURNING id::text, owner_id::text, name, company, email, phone, status, memo, created_at, updated_at, deleted_at
	`, customerID, userID, input.Name, input.Company, input.Email, input.Phone, input.Status, input.Memo)

	item, err := scanCustomer(row)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "customer not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update customer"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"customer": item})
}

func (a app) deleteCustomer(c *gin.Context) {
	userID := c.GetString("userID")
	customerID := c.Param("id")

	result, err := a.db.Exec(`
		UPDATE customers
		SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
	`, customerID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete customer"})
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete customer"})
		return
	}
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "customer not found"})
		return
	}

	c.Status(http.StatusNoContent)
}

func (a app) listTodayTasks(c *gin.Context) {
	userID := c.GetString("userID")
	today := c.Query("date")
	if _, err := parseDate(today); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date must be YYYY-MM-DD"})
		return
	}

	rows, err := a.db.Query(`
		SELECT id::text, customer_id::text, deal_id::text, owner_id::text, title, due_date, status, created_at, updated_at, deleted_at
		FROM tasks
		WHERE owner_id = $1 AND due_date = $2 AND deleted_at IS NULL
		ORDER BY
			CASE WHEN status = 'done' THEN 1 ELSE 0 END,
			updated_at DESC,
			created_at DESC
	`, userID, today)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load tasks"})
		return
	}
	defer rows.Close()

	tasks := []task{}
	for rows.Next() {
		item, err := scanTask(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read task"})
			return
		}
		tasks = append(tasks, item)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load tasks"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"tasks": tasks})
}

func (a app) createTask(c *gin.Context) {
	userID := c.GetString("userID")

	input, ok := bindTaskInput(c)
	if !ok {
		return
	}

	row := a.db.QueryRow(`
		INSERT INTO tasks (customer_id, deal_id, owner_id, title, due_date, status)
		VALUES (NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, $3, $4, $5, 'todo')
		RETURNING id::text, customer_id::text, deal_id::text, owner_id::text, title, due_date, status, created_at, updated_at, deleted_at
	`, input.CustomerID, input.DealID, userID, input.Title, input.DueDate)

	item, err := scanTask(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create task"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"task": item})
}

func (a app) updateTaskStatus(c *gin.Context) {
	userID := c.GetString("userID")
	taskID := c.Param("id")

	var input taskStatusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	input.Status = strings.TrimSpace(input.Status)
	if input.Status != "todo" && input.Status != "done" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be todo or done"})
		return
	}

	row := a.db.QueryRow(`
		UPDATE tasks
		SET status = $3, updated_at = now()
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
		RETURNING id::text, customer_id::text, deal_id::text, owner_id::text, title, due_date, status, created_at, updated_at, deleted_at
	`, taskID, userID, input.Status)

	item, err := scanTask(row)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task": item})
}

func (a app) deleteTask(c *gin.Context) {
	userID := c.GetString("userID")
	taskID := c.Param("id")

	result, err := a.db.Exec(`
		UPDATE tasks
		SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
	`, taskID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete task"})
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete task"})
		return
	}
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "task not found"})
		return
	}

	c.Status(http.StatusNoContent)
}

func (a app) authRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		tokenText, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || strings.TrimSpace(tokenText) == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenText, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return a.jwtSecret, nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		subject, err := token.Claims.GetSubject()
		if err != nil || subject == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token subject"})
			c.Abort()
			return
		}

		c.Set("userID", subject)
		c.Next()
	}
}

func (a app) createAccessToken(currentUser user) (string, error) {
	now := time.Now().UTC()
	claims := jwt.RegisteredClaims{
		Subject:   currentUser.ID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.jwtSecret)
}

func scanUser(row interface {
	Scan(dest ...interface{}) error
}) (user, error) {
	var currentUser user
	err := row.Scan(
		&currentUser.ID,
		&currentUser.Name,
		&currentUser.Email,
		&currentUser.Role,
		&currentUser.IsGuest,
		&currentUser.GuestExpiresAt,
	)
	return currentUser, err
}

func scanCustomer(row interface {
	Scan(dest ...interface{}) error
}) (customer, error) {
	var item customer
	err := row.Scan(
		&item.ID,
		&item.OwnerID,
		&item.Name,
		&item.Company,
		&item.Email,
		&item.Phone,
		&item.Status,
		&item.Memo,
		&item.CreatedAt,
		&item.UpdatedAt,
		&item.DeletedAt,
	)
	return item, err
}

func scanTask(row interface {
	Scan(dest ...interface{}) error
}) (task, error) {
	var item task
	var customerID sql.NullString
	var dealID sql.NullString
	var dueDate sql.NullTime

	err := row.Scan(
		&item.ID,
		&customerID,
		&dealID,
		&item.OwnerID,
		&item.Title,
		&dueDate,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
		&item.DeletedAt,
	)
	if customerID.Valid {
		item.CustomerID = &customerID.String
	}
	if dealID.Valid {
		item.DealID = &dealID.String
	}
	if dueDate.Valid {
		formatted := dueDate.Time.Format("2006-01-02")
		item.DueDate = &formatted
	}

	return item, err
}

func bindCustomerInput(c *gin.Context) (customerInput, bool) {
	var input customerInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return customerInput{}, false
	}

	input.Name = strings.TrimSpace(input.Name)
	input.Company = strings.TrimSpace(input.Company)
	input.Email = strings.TrimSpace(input.Email)
	input.Phone = strings.TrimSpace(input.Phone)
	input.Status = strings.TrimSpace(input.Status)
	input.Memo = strings.TrimSpace(input.Memo)

	if input.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return customerInput{}, false
	}
	if input.Status == "" {
		input.Status = "lead"
	}

	return input, true
}

func bindTaskInput(c *gin.Context) (taskInput, bool) {
	var input taskInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return taskInput{}, false
	}

	input.CustomerID = strings.TrimSpace(input.CustomerID)
	input.DealID = strings.TrimSpace(input.DealID)
	input.Title = strings.TrimSpace(input.Title)
	input.DueDate = strings.TrimSpace(input.DueDate)

	if input.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return taskInput{}, false
	}
	if _, err := parseDate(input.DueDate); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dueDate must be YYYY-MM-DD"})
		return taskInput{}, false
	}

	return input, true
}

func parseDate(value string) (time.Time, error) {
	return time.Parse("2006-01-02", value)
}

func corsMiddleware() gin.HandlerFunc {
	frontendOrigin := os.Getenv("FRONTEND_ORIGIN")
	if frontendOrigin == "" {
		frontendOrigin = "http://localhost:3000"
	}

	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", frontendOrigin)
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func ensureSchema(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE EXTENSION IF NOT EXISTS "pgcrypto";

		CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			email VARCHAR(255) UNIQUE NOT NULL,
			password_hash TEXT,
			role VARCHAR(50) NOT NULL DEFAULT 'user',
			is_guest BOOLEAN NOT NULL DEFAULT false,
			guest_expires_at TIMESTAMP NULL,
			created_at TIMESTAMP NOT NULL DEFAULT now(),
			updated_at TIMESTAMP NOT NULL DEFAULT now(),
			deleted_at TIMESTAMP NULL
		);

		CREATE TABLE IF NOT EXISTS customers (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			owner_id UUID NOT NULL REFERENCES users(id),
			name VARCHAR(255) NOT NULL,
			company VARCHAR(255),
			email VARCHAR(255),
			phone VARCHAR(50),
			status VARCHAR(50) NOT NULL,
			memo TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT now(),
			updated_at TIMESTAMP NOT NULL DEFAULT now(),
			deleted_at TIMESTAMP NULL
		);

		CREATE TABLE IF NOT EXISTS deals (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			customer_id UUID NOT NULL REFERENCES customers(id),
			owner_id UUID NOT NULL REFERENCES users(id),
			title VARCHAR(255) NOT NULL,
			amount INTEGER NOT NULL DEFAULT 0,
			status VARCHAR(50) NOT NULL,
			expected_close_date DATE,
			memo TEXT,
			created_at TIMESTAMP NOT NULL DEFAULT now(),
			updated_at TIMESTAMP NOT NULL DEFAULT now(),
			deleted_at TIMESTAMP NULL
		);

		CREATE TABLE IF NOT EXISTS activities (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			customer_id UUID NOT NULL REFERENCES customers(id),
			owner_id UUID NOT NULL REFERENCES users(id),
			type VARCHAR(50) NOT NULL,
			body TEXT NOT NULL,
			occurred_at TIMESTAMP NOT NULL DEFAULT now(),
			created_at TIMESTAMP NOT NULL DEFAULT now()
		);

		CREATE TABLE IF NOT EXISTS tasks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			customer_id UUID REFERENCES customers(id),
			deal_id UUID REFERENCES deals(id),
			owner_id UUID NOT NULL REFERENCES users(id),
			title VARCHAR(255) NOT NULL,
			due_date DATE,
			status VARCHAR(50) NOT NULL DEFAULT 'todo',
			created_at TIMESTAMP NOT NULL DEFAULT now(),
			updated_at TIMESTAMP NOT NULL DEFAULT now(),
			deleted_at TIMESTAMP NULL
		);
	`)
	return err
}
