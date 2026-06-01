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
