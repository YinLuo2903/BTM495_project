@echo off
rem Developer setup: build the frontend and run the site from source (the repository root).
cd /d "%~dp0.."

if exist ".venv\Scripts\python.exe" (
    echo Environment already exists, skipping setup.
) else (
    echo Creating environment in .venv ...
    python -m venv .venv || (
        echo Could not create the environment. Install Python 3.10 or newer first.
        exit /b 1
    )
)

where npm >nul 2>nul || (
    echo npm was not found. Install Node.js 20 or newer first.
    exit /b 1
)

pushd frontend
if not exist "node_modules" (
    echo Installing frontend dependencies ...
    call npm ci || (
        popd
        echo npm ci failed.
        exit /b 1
    )
)

echo Building the frontend ...
call npm run build || (
    popd
    echo Frontend build failed.
    exit /b 1
)
popd

echo Starting the local website (default http://localhost:8765/). Press Ctrl+C to stop.
".venv\Scripts\python.exe" run_local_website.py %*
