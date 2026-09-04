package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"

	"github.com/example/go-api/internal/service"
	"github.com/example/go-api/pkg/apierror"
)

type Users struct {
	users *service.Users
}

func NewUsers(users *service.Users) *Users {
	return &Users{users: users}
}

func (h *Users) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.users.List(r.Context())
	if err != nil {
		apierror.Write(w, http.StatusInternalServerError, "could not list users")
		return
	}

	writeJSON(w, http.StatusOK, rows)
}

func (h *Users) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		apierror.Write(w, http.StatusBadRequest, "id is not a uuid")
		return
	}

	user, found, err := h.users.Find(r.Context(), id)
	if err != nil {
		apierror.Write(w, http.StatusInternalServerError, "could not read user")
		return
	}
	if !found {
		apierror.Write(w, http.StatusNotFound, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (h *Users) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		DisplayName string `json:"displayName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apierror.Write(w, http.StatusBadRequest, "body is not valid json")
		return
	}

	user, err := h.users.Create(r.Context(), body.Email, body.DisplayName)
	if err != nil {
		apierror.Write(w, http.StatusInternalServerError, "could not create user")
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
