package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type PlaybackStatus struct {
	Source    string `json:"source"`
	Track     string `json:"track"`
	Detail    string `json:"detail"`
	Time      string `json:"time"`
	AudioData string `json:"audioData,omitempty"`
}

type SpotifyAuthRequest struct {
	ClientID    string `json:"clientId"`
	AccessToken string `json:"accessToken"`
}

type spotifyTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
	ExpiresIn   int    `json:"expires_in"`
}

type spotifyProfile struct {
	DisplayName string `json:"display_name"`
	ID          string `json:"id"`
	Email       string `json:"email"`
}

type App struct {
	ctx context.Context
	mu  sync.Mutex

	alwaysOnTop bool
	playback    PlaybackStatus
}

func NewApp() *App {
	return &App{
		playback: PlaybackStatus{
			Source: "local",
			Track:  "No audio selected",
			Detail: "Import an MP3 or connect Spotify",
			Time:   "00:00 / 00:00",
		},
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(ctx context.Context) {
	_ = ctx
}

func (a *App) ToggleAlwaysOnTop(enabled bool) bool {
	a.mu.Lock()
	a.alwaysOnTop = enabled
	a.mu.Unlock()

	if a.ctx != nil {
		runtime.WindowSetAlwaysOnTop(a.ctx, enabled)
	}
	return enabled
}

func (a *App) Minimise() {
	if a.ctx != nil {
		runtime.WindowMinimise(a.ctx)
	}
}

func (a *App) ToggleMaximise() {
	if a.ctx != nil {
		runtime.WindowToggleMaximise(a.ctx)
	}
}

func (a *App) Close() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

func (a *App) ConnectSpotify(req SpotifyAuthRequest) (PlaybackStatus, error) {
	if token := strings.TrimSpace(req.AccessToken); token != "" {
		return a.finishSpotifyConnect(token)
	}

	clientID := strings.TrimSpace(req.ClientID)
	if clientID == "" {
		return a.currentPlayback(), errors.New("spotify client id is required")
	}

	token, err := a.spotifyPKCE(clientID)
	if err != nil {
		return a.currentPlayback(), err
	}
	return a.finishSpotifyConnect(token)
}

func (a *App) ImportAudio() (PlaybackStatus, error) {
	if a.ctx == nil {
		return a.currentPlayback(), errors.New("window is not ready")
	}

	file, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Import audio",
		Filters: []runtime.FileFilter{
			{DisplayName: "Audio files", Pattern: "*.mp3;*.wav;*.m4a;*.ogg"},
		},
	})
	if err != nil {
		return a.currentPlayback(), err
	}
	if strings.TrimSpace(file) == "" {
		return a.currentPlayback(), nil
	}

	status, err := playbackFromFile(file)
	if err != nil {
		return a.currentPlayback(), err
	}
	a.setPlayback(status)
	return status, nil
}

func (a *App) CurrentPlayback() PlaybackStatus {
	return a.currentPlayback()
}

func (a *App) setPlayback(status PlaybackStatus) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.playback = status
}

func (a *App) currentPlayback() PlaybackStatus {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.playback
}

func (a *App) spotifyPKCE(clientID string) (string, error) {
	const redirectURI = "http://127.0.0.1:8000/callback"

	listener, err := net.Listen("tcp", "127.0.0.1:8000")
	if err != nil {
		return "", fmt.Errorf("could not start Spotify callback on %s: %w", redirectURI, err)
	}
	defer listener.Close()

	state, err := randomToken(18)
	if err != nil {
		return "", err
	}
	verifier, err := randomToken(64)
	if err != nil {
		return "", err
	}
	challenge := pkceChallenge(verifier)

	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		if gotState := r.URL.Query().Get("state"); gotState != state {
			http.Error(w, "Invalid state. You can close this tab.", http.StatusBadRequest)
			errCh <- errors.New("spotify returned an invalid state")
			return
		}
		if msg := r.URL.Query().Get("error"); msg != "" {
			http.Error(w, "Spotify denied the request. You can close this tab.", http.StatusBadRequest)
			errCh <- fmt.Errorf("spotify authorization failed: %s", msg)
			return
		}
		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "Missing authorization code. You can close this tab.", http.StatusBadRequest)
			errCh <- errors.New("spotify did not return an authorization code")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<!doctype html><title>Focus connected</title><body style=\"background:#050505;color:#f4f4f4;font:16px monospace;padding:32px\">Spotify connected. You can close this tab.</body>")
		codeCh <- code
	})

	server := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	defer server.Close()

	go func() {
		if serveErr := server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
			errCh <- serveErr
		}
	}()

	authURL := spotifyAuthURL(clientID, redirectURI, challenge, state)
	if a.ctx != nil {
		runtime.BrowserOpenURL(a.ctx, authURL)
	}

	select {
	case code := <-codeCh:
		return exchangeSpotifyCode(clientID, redirectURI, verifier, code)
	case err := <-errCh:
		return "", err
	case <-time.After(2 * time.Minute):
		return "", errors.New("spotify authorization timed out")
	}
}

func (a *App) finishSpotifyConnect(token string) (PlaybackStatus, error) {
	profile, err := fetchSpotifyProfile(token)
	if err != nil {
		return a.currentPlayback(), err
	}
	name := strings.TrimSpace(profile.DisplayName)
	if name == "" {
		name = profile.ID
	}
	if name == "" {
		name = "Spotify user"
	}

	status := PlaybackStatus{
		Source: "spotify",
		Track:  "Spotify connected",
		Detail: name,
		Time:   "ready",
	}
	a.setPlayback(status)
	return status, nil
}

func spotifyAuthURL(clientID, redirectURI, challenge, state string) string {
	values := url.Values{}
	values.Set("client_id", clientID)
	values.Set("response_type", "code")
	values.Set("redirect_uri", redirectURI)
	values.Set("code_challenge_method", "S256")
	values.Set("code_challenge", challenge)
	values.Set("state", state)
	values.Set("scope", "user-read-private user-read-email user-read-playback-state user-read-currently-playing")
	return "https://accounts.spotify.com/authorize?" + values.Encode()
}

func exchangeSpotifyCode(clientID, redirectURI, verifier, code string) (string, error) {
	body := url.Values{}
	body.Set("grant_type", "authorization_code")
	body.Set("code", code)
	body.Set("redirect_uri", redirectURI)
	body.Set("client_id", clientID)
	body.Set("code_verifier", verifier)

	req, err := http.NewRequest(http.MethodPost, "https://accounts.spotify.com/api/token", strings.NewReader(body.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	var token spotifyTokenResponse
	if err := doJSON(req, &token); err != nil {
		return "", err
	}
	if token.AccessToken == "" {
		return "", errors.New("spotify did not return an access token")
	}
	return token.AccessToken, nil
}

func fetchSpotifyProfile(token string) (spotifyProfile, error) {
	req, err := http.NewRequest(http.MethodGet, "https://api.spotify.com/v1/me", nil)
	if err != nil {
		return spotifyProfile{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	var profile spotifyProfile
	return profile, doJSON(req, &profile)
}

func doJSON(req *http.Request, target interface{}) error {
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("spotify returned %s: %s", resp.Status, strings.TrimSpace(string(data)))
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

func playbackFromFile(file string) (PlaybackStatus, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return PlaybackStatus{}, err
	}

	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(file)))
	if mimeType == "" {
		mimeType = "audio/mpeg"
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return PlaybackStatus{
		Source:    "local",
		Track:     trimExt(filepath.Base(file)),
		Detail:    "Local audio",
		Time:      "00:00 / 00:00",
		AudioData: "data:" + mimeType + ";base64," + encoded,
	}, nil
}

func randomToken(size int) (string, error) {
	data := make([]byte, size)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func trimExt(name string) string {
	ext := filepath.Ext(name)
	if ext == "" {
		return name
	}
	return strings.TrimSuffix(name, ext)
}
