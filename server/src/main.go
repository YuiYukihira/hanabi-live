package main // In Go, executable commands must always use package main

// This file contains the entry point for the server software

import (
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/sasha-s/go-deadlock"
)

var (
	projectName string
	projectPath string
	jsonPath    string
	versionPath string
	tablesPath  string
	dataPath    string
	miscPath    string
	clientPath  string

	gitCommitOnStart string
	isDev            bool
	usingSentry      bool
	models           *Models
	datetimeStarted  time.Time
	tables           = NewTables() // An object that tracks ongoing tables
)

func main() {
	// Initialize Sentry (in "sentry.go")
	usingSentry = sentryInit()
	if usingSentry {
		// Flush buffered events before the program terminates
		// https://github.com/getsentry/sentry-go
		defer sentry.Flush(2 * time.Second)
	}

	// Get the project path
	// https://stackoverflow.com/questions/18537257/
	if v, err := os.Executable(); err != nil {
		logger.Fatal("Failed to get the path of the currently running executable: " + err.Error())
	} else {
		// We use "filepath.Dir()" instead of "path.Dir()" because it is platform independent
		projectName = filepath.Base(v)
		projectPath = filepath.Dir(v)
	}

	// Load the ".env" file which contains environment variables with secret values
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		logger.Fatal("Failed to load the \".env\" file: " + err.Error())
		return
	}

	miscPath = os.Getenv("MISCDIR")
	if miscPath == "" {
		miscPath = projectPath
	}

	dataPath = os.Getenv("DATADIR")
	if dataPath == "" {
		dataPath = "."
	}



	// Initialize dev environment
	if os.Getenv("DOMAIN") == "" ||
		os.Getenv("DOMAIN") == "localhost" ||
		strings.HasPrefix(os.Getenv("DOMAIN"), "192.168.") ||
		strings.HasPrefix(os.Getenv("DOMAIN"), "10.") {

		isDev = true
	}

	// Initialize logging
	logger.Init(isDev, usingSentry)
	defer logger.Sync()

	// Configure the deadlock detector
	deadlock.Opts.DisableLockOrderDetection = true

	// Welcome message
	startText := "| Starting " + projectName + " |"
	borderText := "+" + strings.Repeat("-", len(startText)-2) + "+"
	logger.Info(borderText)
	logger.Info(startText)
	logger.Info(borderText)

	// Record the commit that corresponds with when the Golang code was compiled
	// (this is useful to know what version of the server is running,
	// since it is possible to update the client without restarting the server)
	version := os.Getenv("VERSION")
	if version == "" {
		logger.Fatal("No version specified")
		return
	}
	logger.Info("version: " + version)


	clientPath = os.Getenv("CLIENT_DIST")
	if clientPath == "" {
		logger.Warn("No CLIENT_DIST provided, assuming ./")
		clientPath = "./"
	}
	// Check to see if the data path exists
	jsonPath = path.Join(clientPath, "packages", "game", "src", "json")
	if _, err := os.Stat(jsonPath); os.IsNotExist(err) {
		logger.Fatal("The path of \"" + jsonPath + "\" does not exist. " +
			"This directory should always exist; please try re-cloning the repository.")
		return
	} else if err != nil {
		logger.Fatal("Failed to check if the \"" + jsonPath + "\" file exists: " + err.Error())
		return
	}

	// Check to see if the version file exists
	// (which informs us about what the version the client is currently compiled at)
	versionPath = path.Join(clientPath, "public", "js", "bundles", "version.txt")
	if _, err := os.Stat(versionPath); os.IsNotExist(err) {
		logger.Fatal("The \"" + versionPath + "\" file does not exist. " +
			"Did you run the \"install_dependencies.sh\" script before running the server? " +
			"This file should automatically be created when building the client.")
		return
	} else if err != nil {
		logger.Fatal("Failed to check if the \"" + versionPath + "\" file exists: " + err.Error())
		return
	}

	// Check to see if the "ongoing_tables" directory exists
	tablesPath = path.Join(dataPath, "ongoing_tables")
	if _, err := os.Stat(tablesPath); os.IsNotExist(err) {
		if err2 := os.MkdirAll(tablesPath, 0755); err2 != nil {
			logger.Fatal("Failed to create the \"" + tablesPath + "\" directory: " + err2.Error())
			return
		}
	} else if err != nil {
		logger.Fatal("Failed to check if the \"" + tablesPath + "\" file exists: " + err.Error())
		return
	}

	// Initialize the database model (in "models.go")
	if v, err := modelsInit(); err != nil {
		logger.Fatal("Failed to open the database: " + err.Error())
		return
	} else {
		models = v
	}
	defer models.Close()

	// Validate that the database exists
	if err := models.Metadata.TestDatabase(); err != nil {
		if strings.Contains(err.Error(), "Unknown database") {
			logger.Fatal("The \"" + dbName + "\" database does not exist. " +
				"Please follow the instructions located in the \"docs/install.md\" file in order to set up the database.")
			return
		}

		logger.Error("Failed to run the database test query: " + err.Error())
		logger.Fatal("Try re-running the \"install/install_database_schema.sh\" script in order to re-initialize the database.")
		return
	}

	colorsInit()   // (in "colors.go")
	suitsInit()    // (in "suits.go")
	variantsInit() // (in "variants.go")

	// Initialize the action functions command map (in "command_action.go")
	actionsFunctionsInit()

	// Initialize the replay action functions command map (in "command_replay_action.go")
	replayActionsFunctionsInit()

	// Initialize "Detrimental Character Assignments" (in "characters.go")
	charactersInit()

	// Initialize the list that contains every word in the dictionary
	wordListInit()

	// Start the Discord bot (in "discord.go")
	discordInit()

	// Initialize a WebSocket router using the Melody framework (in "websocket.go")
	websocketInit()

	// Initialize chat commands (in "chatCommand.go")
	chatCommandInit()

	// Record the time that the server started
	datetimeStarted = time.Now()

	// Restore tables that were ongoing at the time of the last server restart
	restoreTables()

	// Specify that we are running the HTTP framework in production
	// (it is "gin.DebugMode" by default)
	// Comment this out to debug HTTP stuff
	// This must be done before spawning the localhost goroutine in order to prevent race conditions
	gin.SetMode(gin.ReleaseMode)

	// Initialize an HTTP router that will only listen locally for maintenance-related commands
	// (in "httpLocalhost.go")
	// (the "ListenAndServe" functions located inside here are blocking)
	go httpLocalhostInit()

	// Initialize an HTTP router using the Gin framework (in "http.go")
	// (the "ListenAndServe" functions located inside here are blocking)
	httpInit()
}
