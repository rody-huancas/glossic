package config

import "os"

type Config struct {
	Addr        string
	DatabaseURL string
}

func Load() Config {
	return Config{
		Addr:        env("ADDR", ":8080"),
		DatabaseURL: env("DATABASE_URL", "postgres://localhost:5432/goapi?sslmode=disable"),
	}
}

func env(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}

	return fallback
}
