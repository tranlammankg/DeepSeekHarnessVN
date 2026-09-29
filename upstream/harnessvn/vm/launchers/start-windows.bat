@echo off
REM HarnessVN - khoi dong may ao tren Windows. Khong can mo dong lenh.
setlocal enabledelayedexpansion
set HERE=%~dp0
set IMAGE=%HERE%harnessvn-24.04-amd64.qcow2
set PORT=9999
set BRIDGE=9998

REM Cong 9999 phai trong: cua noi trong may ao chuyen huong co dinh toi cong nay.
netstat -ano | findstr /R /C:":9999 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Cong 9999 dang bi mot chuong trinh khac dung.
  echo Hay dong chuong trinh do roi chay lai file nay.
  pause
  exit /b 1
)
REM Cong cua noi co the doi: trinh duyet mo cong nay, con ung dung van o cong 9999.
netstat -ano | findstr /R /C:":9998 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Cong 9998 dang ban - dung cong 19998 cho cua noi.
  set BRIDGE=19998
)

where qemu-system-x86_64 >nul 2>nul
if errorlevel 1 (
  echo May ban chua co QEMU - phan mem mien phi de chay may ao ^(khoang 200 MB^).
  echo.
  choice /C CT /M "Toi cai giup ban [C] hay de toi tu cai sau [T]"
  if errorlevel 2 goto :noqemu
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Khong tim thay winget. Hay tai QEMU tai https://www.qemu.org/download/
    pause & exit /b 1
  )
  echo Dang cai QEMU...
  winget install --id SoftwareFreedomConservancy.QEMU -e --accept-source-agreements --accept-package-agreements
  echo Cai xong. Hay mo lai file nay.
  pause & exit /b 0
)

if not exist "%IMAGE%" (
  echo Khong thay anh may ao: %IMAGE%
  echo Hay tai goi phat hanh HarnessVN va dat canh file nay.
  pause & exit /b 1
)

echo Dang khoi dong HarnessVN... trinh duyet se tu mo sau it giay.
echo Lan dau co the mat 10-20 phut; trang cho se tu chuyen tiep.
start "" cmd /c "timeout /t 25 >nul & start http://localhost:%BRIDGE%"
qemu-system-x86_64 -m 4096 -smp 2 -display none ^
  -drive "file=%IMAGE%,if=virtio" ^
  -netdev "user,id=n0,hostfwd=tcp:127.0.0.1:%PORT%-127.0.0.1:9999,hostfwd=tcp:127.0.0.1:%BRIDGE%-127.0.0.1:9998" -device virtio-net-pci,netdev=n0
pause
exit /b 0

:noqemu
echo.
echo Neu may ban khong bat duoc ao hoa, hay dung file .ova voi VirtualBox:
echo   - Tai VirtualBox mien phi, mo no, chon File ^> Import Appliance, chon HarnessVN.ova
pause
exit /b 1
