@echo off
setlocal

echo --- Starting RooFlow config setup ---

:: --- Dependency Checks ---
echo Checking dependencies...
call :CheckGit
if errorlevel 1 goto DependencyError
call :CheckPython
if errorlevel 1 goto DependencyError
call :CheckPyYAML
if errorlevel 1 goto DependencyError
echo All dependencies found.
:: --- End Dependency Checks ---

:: Define a temporary directory for cloning
:: FIXED TYPO: Was TEMP_CLONEDIR in one place, TEMP_CLONE_DIR in others. Standardizing.
set "TEMP_CLONE_DIR=%TEMP%\RooFlowClone_%RANDOM%"
echo Cloning target: %TEMP_CLONE_DIR%

:: Clone the repository
echo Cloning RooFlow repository...
git clone --depth 1 https://github.com/GreatScottyMac/RooFlow "%TEMP_CLONE_DIR%"
if %errorlevel% neq 0 (
    echo Error: Failed to clone RooFlow repository. Check your internet connection and Git setup.
    exit /b 1
)

:: Check if clone was successful by checking for the config dir
if not exist "%TEMP_CLONE_DIR%\config" (
    echo Error: RooFlow repository clone seems incomplete. Config directory not found in temp location.
    if exist "%TEMP_CLONE_DIR%" rmdir /s /q "%TEMP_CLONE_DIR%" >nul 2>nul
    exit /b 1
)

:: --- MODIFIED COPY SECTION START ---
echo Copying specific configuration items...

set "COPY_ERROR=0"

:: 1. Copy .roo directory and its contents
echo Copying .roo directory...
robocopy "%TEMP_CLONE_DIR%\config\.roo" "%CD%\.roo" /E /NFL /NDL /NJH /NJS /nc /ns /np
if %errorlevel% gtr 7 (
    echo   ERROR: Failed to copy .roo directory. Robocopy Errorlevel: %errorlevel%
    set "COPY_ERROR=1"
) else (
    echo   Copied .roo directory.
)

:: 2. Copy .roomodes file
if %COPY_ERROR% equ 0 (
    echo Copying .roomodes...
    robocopy "%TEMP_CLONE_DIR%\config" "%CD%" .roomodes /NFL /NDL /NJH /NJS /nc /ns /np
    if %errorlevel% gtr 7 (
        echo   ERROR: Failed to copy .roomodes using robocopy. Errorlevel: %errorlevel%
        set "COPY_ERROR=1"
    ) else (
        echo   Copied .roomodes.
    )
)

:: Removed copy for insert-variables.cmd
:: 4. Copy Python script
if %COPY_ERROR% equ 0 (
    echo Copying generate_mcp_yaml.py...
    copy /Y "%TEMP_CLONE_DIR%\config\generate_mcp_yaml.py" "%CD%\"
    if errorlevel 1 (
        echo   ERROR: Failed to copy generate_mcp_yaml.py. Check source file exists and permissions.
        set "COPY_ERROR=1"
    ) else (
        echo   Copied generate_mcp_yaml.py.
    )
)

:: Removed copy for process_prompts.ps1

:: Check if any copy operation failed before proceeding
if %COPY_ERROR% equ 1 (
    echo ERROR: One or more essential files/directories could not be copied. Aborting setup.
    if exist "%TEMP_CLONE_DIR%" rmdir /s /q "%TEMP_CLONE_DIR%" >nul 2>nul
    exit /b 1
)

:: --- MODIFIED COPY SECTION END ---


:: --- MODIFIED CLEANUP SECTION START ---
echo Cleaning up temporary clone directory...
if exist "%TEMP_CLONE_DIR%" (
    rmdir /s /q "%TEMP_CLONE_DIR%" >nul 2>nul
    if errorlevel 1 (
       echo   Warning: Failed to completely remove temporary clone directory: %TEMP_CLONE_DIR%
    ) else (
       echo   Removed temporary clone directory.
    )
) else ( echo Temp clone directory not found to remove. )

:: Removed cleanup for insert-variables.sh (never copied)
:: Removed cleanup for default-mode directory (never copied)
:: --- MODIFIED CLEANUP SECTION END ---


:: Check if the essential copied items exist before running script
if not exist "%CD%\.roo" (
    echo Error: .roo directory not found after specific copy. Setup failed.
    exit /b 1
)
:: Check if Python script was copied
if not exist "%CD%\generate_mcp_yaml.py" (
    echo Error: generate_mcp_yaml.py not found after specific copy. Setup failed.
    exit /b 1
)

:: Run the Python script to process templates
echo Running Python script to process templates...
:: Get OS/Shell/Home/Workspace variables defined earlier
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).Caption"') do set "OS_VAL=%%a"
set "SHELL_VAL=cmd"
set "HOME_VAL=%USERPROFILE%"
set "WORKSPACE_VAL=%CD%"

:: Ensure quotes around arguments, especially paths
python generate_mcp_yaml.py --os "%OS_VAL%" --shell "%SHELL_VAL%" --home "%HOME_VAL%" --workspace "%WORKSPACE_VAL%"
if %errorlevel% neq 0 (
    echo Error: Python script generate_mcp_yaml.py failed to execute properly.
    exit /b 1
)

echo --- RooFlow config setup complete ---
:: Removed deletion of insert-variables.cmd
:: Removed self-deletion of install_rooflow.cmd

goto ScriptEnd

:DependencyError
echo A required dependency (Git, Python, or PyYAML) was not found or failed check. Aborting.
exit /b 1

:ScriptEnd
goto :EOF

:: --- Subroutines ---

:CheckGit
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: git is not found in your PATH.
    echo Please install Git and ensure it's added to your system's PATH.
    echo You can download Git from: https://git-scm.com/download/win
    exit /b 1
)
echo   - Git found.
goto :EOF

:CheckPython
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: python is not found in your PATH.
    echo Please install Python 3 ^(https://www.python.org/downloads/^) and ensure it's added to PATH.
    exit /b 1
)
echo   - Python found.
goto :EOF

:CheckPyYAML
python -c "import yaml" >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: PyYAML library is not found for Python.
    echo Please install it using: pip install pyyaml
    exit /b 1
)
echo   - PyYAML library found.
goto :EOF

:: --- End Subroutines ---

endlocal
exit /b 0