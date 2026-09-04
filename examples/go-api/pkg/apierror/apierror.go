package apierror

import (
	"encoding/json"
	"net/http"
)

type Body struct {
	Status  int    `json:"status"`
	Message string `json:"message"`
}

func Write(w http.ResponseWriter, status int, message string) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(Body{Status: status, Message: message})
}
