@echo off
chcp 65001 >nul
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
npm run dev
