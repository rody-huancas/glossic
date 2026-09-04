package router

import (
	"net/http"

	"github.com/example/go-api/internal/handlers"
	"github.com/example/go-api/internal/middleware"
)

func New(users *handlers.Users) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", handlers.Health)
	mux.HandleFunc("GET /api/users", users.List)
	mux.HandleFunc("GET /api/users/{id}", users.Get)
	mux.HandleFunc("POST /api/users", users.Create)

	return middleware.Logging(mux)
}
