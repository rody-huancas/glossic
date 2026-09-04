package main

import (
	"log"
	"net/http"

	"github.com/example/go-api/internal/config"
	"github.com/example/go-api/internal/handlers"
	"github.com/example/go-api/internal/repository"
	"github.com/example/go-api/internal/router"
	"github.com/example/go-api/internal/service"
)

func main() {
	cfg := config.Load()

	users := handlers.NewUsers(service.NewUsers(repository.NewUsers()))

	log.Printf("listening on %s", cfg.Addr)

	if err := http.ListenAndServe(cfg.Addr, router.New(users)); err != nil {
		log.Fatal(err)
	}
}
