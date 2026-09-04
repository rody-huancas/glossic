package repository

import (
	"context"
	"sort"
	"sync"

	"github.com/google/uuid"

	"github.com/example/go-api/internal/models"
)

type Users struct {
	mu    sync.RWMutex
	rows  map[uuid.UUID]models.User
}

func NewUsers() *Users {
	return &Users{rows: make(map[uuid.UUID]models.User)}
}

func (u *Users) List(_ context.Context) ([]models.User, error) {
	u.mu.RLock()
	defer u.mu.RUnlock()

	out := make([]models.User, 0, len(u.rows))
	for _, row := range u.rows {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Email < out[j].Email })

	return out, nil
}

func (u *Users) Find(_ context.Context, id uuid.UUID) (models.User, bool, error) {
	u.mu.RLock()
	defer u.mu.RUnlock()

	row, ok := u.rows[id]

	return row, ok, nil
}

func (u *Users) Add(_ context.Context, user models.User) error {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.rows[user.ID] = user

	return nil
}
