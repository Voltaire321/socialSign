@echo off
echo ========================================
echo  Empaquetando Backend para Hostinger
echo ========================================
echo.

REM Crear carpeta temporal para el backend
set TEMP_DIR=backend-to-upload
if exist %TEMP_DIR% rmdir /s /q %TEMP_DIR%
mkdir %TEMP_DIR%

echo [1/8] Copiando archivos principales...
copy .env.production %TEMP_DIR%\.env.production
copy package.json %TEMP_DIR%\package.json
copy package-lock.json %TEMP_DIR%\package-lock.json
copy app.js %TEMP_DIR%\app.js

echo [2/8] Copiando carpeta bin...
xcopy bin %TEMP_DIR%\bin\ /E /I /Q

echo [3/8] Copiando carpeta config...
xcopy config %TEMP_DIR%\config\ /E /I /Q

echo [4/8] Copiando carpeta routes...
xcopy routes %TEMP_DIR%\routes\ /E /I /Q

echo [5/8] Copiando carpeta public...
xcopy public %TEMP_DIR%\public\ /E /I /Q

echo [6/8] Copiando carpeta views...
xcopy views %TEMP_DIR%\views\ /E /I /Q

echo [7/8] Copiando instrucciones...
copy ARCHIVOS_A_SUBIR.txt %TEMP_DIR%\INSTRUCCIONES.txt

echo.
echo ========================================
echo  ✅ Backend empaquetado correctamente
echo ========================================
echo.
echo Carpeta creada: %TEMP_DIR%\
echo.
echo SIGUIENTE PASO:
echo 1. Abre tu cliente FTP (FileZilla, WinSCP, etc.)
echo 2. Conecta a tu servidor Hostinger
echo 3. Sube TODO el contenido de la carpeta "%TEMP_DIR%\" a "/public_html/api/"
echo 4. Asegurate de que .env.production se suba correctamente
echo.
echo Luego, conectate via SSH y ejecuta:
echo    cd /home/u739395885/public_html/api
echo    cp .env.production .env
echo    npm install --production
echo    node -e "require('./config/database').initializeTables().then(() => process.exit(0))"
echo    pm2 start bin/www --name social-login-api
echo.
pause
