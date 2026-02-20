*** Settings ***
Library           RPA.Desktop
Library           OperatingSystem

*** Variables ***
${TEXTO}          Este es un texto generado por OCR.

*** Tasks ***
Abrir Notepad y escribir texto
    Open Application    notepad.exe
    Wait For Active Window    title=.*Notepad.*    timeout=5s
    Type Text    ${TEXTO}