package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/example/go-api/internal/models"
	"github.com/example/go-api/internal/repository"
)

type Users struct {
	repo *repository.Users
}

func NewUsers(repo *repository.Users) *Users {
	return &Users{repo: repo}
}

func (u *Users) List(ctx context.Context) ([]models.User, error) {
	return u.repo.List(ctx)
}

func (u *Users) Find(ctx context.Context, id uuid.UUID) (models.User, bool, error) {
	return u.repo.Find(ctx, id)
}

func (u *Users) Create(ctx context.Context, email, displayName string) (models.User, error) {
	user := models.User{
		ID:          uuid.New(),
		Email:       strings.ToLower(strings.TrimSpace(email)),
		DisplayName: strings.TrimSpace(displayName),
		CreatedAt:   time.Now().UTC(),
	}

	if err := u.repo.Add(ctx, user); err != nil {
		return models.User{}, err
	}

	return user, nil
}
