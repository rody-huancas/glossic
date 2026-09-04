package handlers

import (
	"context"
	"testing"

	"github.com/example/go-api/internal/repository"
	"github.com/example/go-api/internal/service"
)

func TestCreateNormalisesTheEmail(t *testing.T) {
	users := service.NewUsers(repository.NewUsers())

	created, err := users.Create(context.Background(), "  Ada@Example.COM ", "Ada")
	if err != nil {
		t.Fatal(err)
	}

	if created.Email != "ada@example.com" {
		t.Fatalf("got %q", created.Email)
	}
}
